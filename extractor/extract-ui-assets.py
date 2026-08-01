#!/usr/bin/env python3
"""Extract the planner-facing UI sprites from the installed game bundles.

The output is intentionally limited to the combat-skill equipment screen and
its skill/category emblems so the website can be refreshed after a game patch
without redistributing unrelated game art.
"""

from __future__ import annotations

import argparse
import importlib
from pathlib import Path
import sys
import types

import UnityPy
from PIL.Image import Transpose
from UnityPy.enums import SpritePackingRotation


def load_unitypy_image_helpers():
    """Load only UnityPy's image exporters, without its optional FMOD stack.

    UnityPy 1.25 imports every exporter from ``UnityPy.export.__init__``.  That
    includes the optional AudioClip converter and makes an otherwise image-only
    portable build depend on FMOD.  Registering the package namespace first
    lets us import the two image modules directly and keeps the release free of
    that proprietary, unused runtime dependency.
    """

    # Texture2DConverter imports the optional ASTC encoder eagerly even though
    # extraction only calls its decoding path.  A namespace stub keeps that
    # encoder (and its CPU-specific archspec data) out of the portable bundle.
    sys.modules.setdefault("astc_encoder", types.ModuleType("astc_encoder"))

    package_name = "UnityPy.export"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__package__ = package_name
        package.__path__ = [str(Path(UnityPy.__file__).resolve().parent / "export")]
        sys.modules[package_name] = package

    sprite_helper = importlib.import_module(f"{package_name}.SpriteHelper")
    texture_converter = importlib.import_module(f"{package_name}.Texture2DConverter")
    return sprite_helper.SpriteSettings, texture_converter.get_image_from_texture2d


SpriteSettings, get_image_from_texture2d = load_unitypy_image_helpers()


ATLAS_FILTERS = {
    "atlas_charactermenu_equipcombatskill.uab": (
        "charactermenu3_22_type_",
        "charactermenu3_23_zhanyongge_0",
        "charactermenu3_23_kongtiao_0",
    ),
    "atlas_combatskilltypeicon.uab": ("GongFaIcon_",),
    "atlas_combatskillicon.uab": ("sp_combatskillback_",),
    "atlas_combatskilliconlegacy.uab": ("sp_icon_combatskill_",),
}

TEXTURE_NAMES = {
    "charactermenu3_21_yuanpan",
    "charactermenu3_19_beijingyinhua",
}


def safe_name(value: str) -> str:
    return "".join(character if character.isalnum() or character in "-_" else "_" for character in value)


def prepare_group(output: Path, name: str) -> Path:
    group = output / name
    group.mkdir(parents=True, exist_ok=True)
    for stale_image in group.glob("*.png"):
        stale_image.unlink()
    return group


def atlas_images(bundle: Path, prefixes: tuple[str, ...]):
    environment = UnityPy.load(str(bundle))
    objects = {obj.path_id: obj for obj in environment.objects}
    texture_cache = {}
    for obj in environment.objects:
        if obj.type.name != "SpriteAtlas":
            continue
        atlas = obj.read_typetree()
        names = atlas.get("m_PackedSpriteNamesToIndex", [])
        render_data = atlas.get("m_RenderDataMap", [])
        for index, name in enumerate(names):
            if not name.startswith(prefixes):
                continue
            _, data = render_data[index]
            texture_id = data["texture"]["m_PathID"]
            if texture_id not in texture_cache:
                texture_cache[texture_id] = get_image_from_texture2d(objects[texture_id].read(), False)
            rect = data["textureRect"]
            image = texture_cache[texture_id].crop((
                int(rect["x"]),
                int(rect["y"]),
                int(rect["x"] + rect["width"]),
                int(rect["y"] + rect["height"]),
            ))
            settings = SpriteSettings(data["settingsRaw"])
            if settings.packed:
                if settings.packingRotation == SpritePackingRotation.kSPRFlipHorizontal:
                    image = image.transpose(Transpose.FLIP_LEFT_RIGHT)
                elif settings.packingRotation == SpritePackingRotation.kSPRFlipVertical:
                    image = image.transpose(Transpose.FLIP_TOP_BOTTOM)
                elif settings.packingRotation == SpritePackingRotation.kSPRRotate180:
                    image = image.transpose(Transpose.ROTATE_180)
                elif settings.packingRotation == SpritePackingRotation.kSPRRotate90:
                    image = image.transpose(Transpose.ROTATE_270)
            yield name, image.transpose(Transpose.FLIP_TOP_BOTTOM)


def direct_images(bundle: Path):
    environment = UnityPy.load(str(bundle))
    preferred = {}
    for obj in environment.objects:
        if obj.type.name not in {"Sprite", "Texture2D"}:
            continue
        name = obj.peek_name()
        if name not in TEXTURE_NAMES:
            continue
        if obj.type.name == "Sprite":
            preferred[name] = obj.read().image
        elif name not in preferred:
            preferred[name] = obj.read().image
    yield from preferred.items()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--game", required=True, help="The Scroll Of Taiwu install directory")
    parser.add_argument("--out", required=True, help="Output directory")
    args = parser.parse_args()

    resources = Path(args.game) / "The Scroll of Taiwu_Data" / "GameResources"
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    extracted = 0

    for bundle_name, prefixes in ATLAS_FILTERS.items():
        group = prepare_group(output, Path(bundle_name).stem.replace("atlas_", ""))
        for name, image in atlas_images(resources / bundle_name, prefixes):
            image.save(group / f"{safe_name(name)}.png", optimize=True)
            extracted += 1

    group = prepare_group(output, "combatskill-ui")
    for name, image in direct_images(resources / "ui_texture_combatskill.uab"):
        image.save(group / f"{safe_name(name)}.png", optimize=True)
        extracted += 1

    print(f"Extracted {extracted} original UI images to {output}")


if __name__ == "__main__":
    main()
