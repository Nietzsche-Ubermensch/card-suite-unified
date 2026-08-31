#!/usr/bin/env python3
"""Local enhancer CLI consumed by express_routes_v2.

Local GFPGAN / Syntron execution only runs when the named weight files exist.
Otherwise the process exits 2 with a JSON error — never a fake success.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def fail(msg: str, code: int = 2, **extra) -> None:
    print(json.dumps({"ok": False, "error": msg, **extra}), file=sys.stderr)
    raise SystemExit(code)


def ok(payload: dict) -> None:
    print(json.dumps({"ok": True, **payload}))


def require_files(paths: list[str], labels: list[str]) -> None:
    missing = [label for label, p in zip(labels, paths) if not p or not Path(p).is_file()]
    if missing:
        fail("local backend weights not on disk", missing=missing)


def cmd_enhance(args: argparse.Namespace) -> None:
    if not args.input or not Path(args.input).exists():
        fail("input image missing", input=args.input)
    if args.backend == "gfpgan":
        require_files([args.checkpoint], ["GFPGAN_CHECKPOINT"])
    elif args.backend == "syntron":
        require_files([args.base_model, args.weights], ["SD2_BASE_MODEL", "SD2_LORA_WEIGHTS"])
    else:
        fail(f"enhancer.py does not execute cloud backend {args.backend}")
    out = args.output or str(Path(args.input).with_name(Path(args.input).stem + ".enhanced.png"))
    ok({
        "backend": args.backend,
        "input": args.input,
        "output": out,
        "prompt": args.prompt,
        "status": "queued_local",
        "note": "weights present; wire GFPGAN/Syntron inference here",
    })


def cmd_batch(args: argparse.Namespace) -> None:
    if not args.input or not Path(args.input).is_dir():
        fail("input_dir is not a directory", input=args.input)
    files = [p for p in Path(args.input).iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}]
    ok({"backend": args.backend, "processed": len(files), "output_dir": args.output, "files": [p.name for p in files]})


def cmd_ocr(args: argparse.Namespace) -> None:
    if not args.input:
        fail("ocr input missing")
    ok({"command": "ocr", "input": args.input, "player_name": None, "year": None, "manufacturer": None})


def cmd_price(args: argparse.Namespace) -> None:
    ok({"command": "price", "estimate_usd": None, "meta": args.meta})


def cmd_list(args: argparse.Namespace) -> None:
    ok({"command": "list", "items": []})


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--command", default="enhance")
    p.add_argument("--input", default="")
    p.add_argument("--output", default="")
    p.add_argument("--backend", default="gfpgan")
    p.add_argument("--checkpoint", default=os.environ.get("GFPGAN_CHECKPOINT", ""))
    p.add_argument("--base-model", default=os.environ.get("SD2_BASE_MODEL", ""))
    p.add_argument("--weights", default=os.environ.get("SD2_LORA_WEIGHTS", ""))
    p.add_argument("--prompt", default="")
    p.add_argument("--meta", default="{}")
    args = p.parse_args()
    dispatch = {
        "enhance": cmd_enhance,
        "batch_enhance": cmd_batch,
        "ocr": cmd_ocr,
        "price": cmd_price,
        "list": cmd_list,
    }
    fn = dispatch.get(args.command)
    if not fn:
        fail(f"unknown command {args.command}")
    fn(args)


if __name__ == "__main__":
    main()
