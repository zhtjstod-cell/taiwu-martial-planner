#!/usr/bin/env python3
"""Extract the planner-facing UI sprites from the installed game bundles.

The output is intentionally limited to the combat-skill equipment screen and
its skill/category emblems so the website can be refreshed after a game patch
without redistributing unrelated game art.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import UnityPy
from PIL.Image import Transpose
from UnityPy.enums import SpritePackingRotation
from UnityPy.export.SpriteHelper import SpriteSettings
from UnityPy.export.Texture2DConverter import get_image_from_texture2d


ATLAS_FILTERS = {
    "atlas_charactermenu_equipcombatskill.uab": (
        "charactermenu3_22_type_",
        "charactermenu3_23_zhanyongge_0",
        "charactermenu3_23_kongtiao_0",
    ),
    "atlas_combatskilltypeicon.uab": ("GongFaIcon_",),
    "atlas_combatskillicon.uab": ("sp_combatskillback_",),
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
