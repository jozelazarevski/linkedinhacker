"""Command-line interface for the Humanizer platform.

    humanizer train <path|-|"text"> [--profile me] [--split]   add your writing
    humanizer analyze [--profile me]                            distill a style guide
    humanizer rewrite <text|-> [--profile me] [-i "instruction"]
    humanizer humanize <text|->  [--profile me]                 strip AI tells, match voice
    humanizer write "<brief>"    [--profile me]                 generate in your voice
    humanizer profile [--profile me]                            show style guide + counts
    humanizer profiles                                          list voices
    humanizer forget [--profile me] --yes                       delete all samples
"""
import argparse
import sys
from typing import Optional

from . import diff, engine
from .config import MODEL, has_api_key
from .engine import AUGMENTATION_LEVELS, DEFAULT_LEVEL
from .ingest import from_path, from_text
from .store import Store


def _read_input(value: Optional[str]) -> str:
    """Resolve a positional text arg: '-' (stdin), a file path, or literal text."""
    if value is None or value == "-":
        return sys.stdin.read()
    return value


def _need_api_key() -> bool:
    if not has_api_key():
        print(
            "error: ANTHROPIC_API_KEY is not set.\n"
            "Get a key at https://console.anthropic.com and `export ANTHROPIC_API_KEY=...` "
            "(or put it in a .env file).",
            file=sys.stderr,
        )
        return False
    return True


def cmd_train(args) -> int:
    store = Store()
    added = 0
    raw = args.text
    # Decide if the argument is a path or literal/stdin text.
    if raw is None or raw == "-":
        for t in from_text(sys.stdin.read(), split=args.split):
            store.add_sample(args.profile, t, source="stdin")
            added += 1
    else:
        try:
            pairs = from_path(raw, split=args.split)
            for source, text in pairs:
                store.add_sample(args.profile, text, source=source)
                added += 1
        except FileNotFoundError:
            # Treat as literal text.
            for t in from_text(raw, split=args.split):
                store.add_sample(args.profile, t, source="inline")
                added += 1
    total = store.count_samples(args.profile)
    store.close()
    print(f"Added {added} sample(s) to profile '{args.profile}'. Total: {total}.")
    if added:
        print("Next: `humanizer analyze` to distill your style guide.")
    return 0


def cmd_analyze(args) -> int:
    if not _need_api_key():
        return 2
    store = Store()
    samples = [s.text for s in store.list_samples(args.profile)]
    if not samples:
        print(f"No samples for profile '{args.profile}'. Run `humanizer train` first.", file=sys.stderr)
        store.close()
        return 1
    print(f"Analyzing {len(samples)} sample(s) with {MODEL}…", file=sys.stderr)
    guide = engine.analyze_style(samples)
    store.set_style_guide(args.profile, guide)
    store.close()
    print(guide)
    return 0


def _run_voice_op(args, op_name: str) -> int:
    if not _need_api_key():
        return 2
    store = Store()
    profile = store.get_profile(args.profile)
    samples = [s.text for s in store.list_samples(args.profile)]
    if not samples:
        print(
            f"No samples for profile '{args.profile}'. Run `humanizer train` first "
            "so I have your voice to imitate.",
            file=sys.stderr,
        )
        store.close()
        return 1
    style_guide = profile.style_guide if profile else None
    text = _read_input(args.text)
    if not text.strip():
        print("error: no input text provided.", file=sys.stderr)
        store.close()
        return 1

    level = getattr(args, "level", DEFAULT_LEVEL)
    if op_name == "rewrite":
        msg = engine.rewrite(style_guide, samples, text, instruction=args.instruction, level=level)
    elif op_name == "humanize":
        msg = engine.humanize(style_guide, samples, text, level=level)
    else:  # write
        msg = engine.generate(style_guide, samples, text, level=level)

    store.close()
    result = engine.result_text(msg)
    print(result)  # clean result on stdout (pipe-friendly)

    # Diff view goes to stderr so piping the result stays clean.
    if getattr(args, "diff", False) and op_name in ("rewrite", "humanize"):
        color = None if not getattr(args, "no_color", False) else False
        print("\n" + diff.report(text, result, color=color), file=sys.stderr)
    if args.verbose:
        print(f"\n[{engine.cache_stats(msg)}]", file=sys.stderr)
    return 0


def cmd_rewrite(args) -> int:
    return _run_voice_op(args, "rewrite")


def cmd_humanize(args) -> int:
    return _run_voice_op(args, "humanize")


def cmd_write(args) -> int:
    return _run_voice_op(args, "write")


def cmd_profile(args) -> int:
    store = Store()
    profile = store.get_profile(args.profile)
    n = store.count_samples(args.profile)
    store.close()
    if not profile:
        print(f"No profile named '{args.profile}' yet.")
        return 0
    print(f"Profile: {profile.name}")
    print(f"Samples: {n}")
    print(f"Style guide: {'set' if profile.style_guide else 'not analyzed yet'}")
    if profile.style_guide:
        print("\n" + profile.style_guide)
    return 0


def cmd_profiles(args) -> int:
    store = Store()
    profiles = store.list_profiles()
    for p in profiles:
        n = store.count_samples(p.name)
        flag = "✓" if p.style_guide else " "
        print(f"[{flag}] {p.name}  ({n} samples)")
    if not profiles:
        print("No profiles yet. Run `humanizer train` to create one.")
    store.close()
    return 0


def cmd_forget(args) -> int:
    if not args.yes:
        print("Refusing to delete without --yes.", file=sys.stderr)
        return 1
    store = Store()
    removed = store.clear_samples(args.profile)
    store.close()
    print(f"Deleted {removed} sample(s) from profile '{args.profile}'.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="humanizer", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--profile", default="me", help="voice profile name (default: me)")
    sub = p.add_subparsers(dest="command", required=True)

    t = sub.add_parser("train", help="add your writing samples")
    t.add_argument("text", nargs="?", help="file, directory, '-' for stdin, or literal text")
    t.add_argument("--split", action="store_true", help="split input into multiple samples on '---' or blank-line gaps")
    t.set_defaults(func=cmd_train)

    a = sub.add_parser("analyze", help="distill a style guide from your samples")
    a.set_defaults(func=cmd_analyze)

    levels = list(AUGMENTATION_LEVELS.keys())

    def _add_level(sp):
        sp.add_argument(
            "-l", "--level", choices=levels, default=DEFAULT_LEVEL,
            help=f"augmentation strength: light=minimal touch, heavy=full rewrite (default: {DEFAULT_LEVEL})",
        )

    r = sub.add_parser("rewrite", help="rewrite text in your voice")
    r.add_argument("text", nargs="?", help="text or '-' for stdin")
    r.add_argument("-i", "--instruction", help="extra instruction (e.g. 'make it shorter')")
    _add_level(r)
    r.add_argument("-d", "--diff", action="store_true", help="show before/after changes + AI tells removed")
    r.add_argument("--no-color", action="store_true", help="plain-text diff (no ANSI color)")
    r.add_argument("-v", "--verbose", action="store_true", help="print token/cache usage")
    r.set_defaults(func=cmd_rewrite)

    h = sub.add_parser("humanize", help="strip AI tells and match your voice")
    h.add_argument("text", nargs="?", help="text or '-' for stdin")
    _add_level(h)
    h.add_argument("-d", "--diff", action="store_true", help="show before/after changes + AI tells removed")
    h.add_argument("--no-color", action="store_true", help="plain-text diff (no ANSI color)")
    h.add_argument("-v", "--verbose", action="store_true", help="print token/cache usage")
    h.set_defaults(func=cmd_humanize, instruction=None)

    w = sub.add_parser("write", help="generate new text in your voice from a brief")
    w.add_argument("text", nargs="?", help="brief, or '-' for stdin")
    _add_level(w)
    w.add_argument("-v", "--verbose", action="store_true", help="print token/cache usage")
    w.set_defaults(func=cmd_write, instruction=None)

    pr = sub.add_parser("profile", help="show a profile's style guide and counts")
    pr.set_defaults(func=cmd_profile)

    sub.add_parser("profiles", help="list all voice profiles").set_defaults(func=cmd_profiles)

    f = sub.add_parser("forget", help="delete all samples for a profile")
    f.add_argument("--yes", action="store_true", help="confirm deletion")
    f.set_defaults(func=cmd_forget)

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:  # pragma: no cover
        return 130
    except Exception as exc:  # surface a clean message
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
