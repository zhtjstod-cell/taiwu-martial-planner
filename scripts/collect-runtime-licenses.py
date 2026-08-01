#!/usr/bin/env python3

from __future__ import annotations

import importlib.metadata
import shutil
import sys
from pathlib import Path


destination = Path(sys.argv[1]).resolve()
destination.mkdir(parents=True, exist_ok=True)

python_license = Path(sys.base_prefix) / "LICENSE.txt"
if python_license.is_file():
    shutil.copy2(python_license, destination / "Python-LICENSE.txt")

for package in ("UnityPy", "Pillow", "pyinstaller"):
    distribution = importlib.metadata.distribution(package)
    copied = 0
    for entry in distribution.files or ():
        name = Path(str(entry)).name.lower()
        if "license" not in name and "copying" not in name:
            continue
        source = Path(distribution.locate_file(entry))
        if source.is_file():
            copied += 1
            shutil.copy2(source, destination / f"{package}-{copied}-{source.name}")
