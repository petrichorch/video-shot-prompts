#!/usr/bin/env python3
"""Generate one image through APIYi's gpt-image-2 endpoint."""

import argparse
import base64
import binascii
import json
import mimetypes
from pathlib import Path
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_KEY_FILE = SKILL_DIR / ".apiyi-key"
DEFAULT_BASE_URL = "https://api.apiyi.com/v1"
DEFAULT_MODEL = "gpt-image-2"
DEFAULT_SIZE = "1152x2048"
DEFAULT_QUALITY = "medium"
DEFAULT_OUTPUT_FORMAT = "jpeg"
DEFAULT_OUTPUT_COMPRESSION = 90


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate one image and save data[0].b64_json as a PNG file."
    )
    prompt_group = parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt", help="Final image prompt sent to the API.")
    prompt_group.add_argument(
        "--prompt-file", type=Path, help="UTF-8 text file containing the final image prompt."
    )
    parser.add_argument("--output", type=Path, required=True, help="Output image path.")
    parser.add_argument(
        "--reference",
        type=Path,
        action="append",
        dest="references",
        help="Reference image for edit/fusion mode; repeat for multiple images.",
    )
    parser.add_argument(
        "--mask", type=Path, help="Optional alpha PNG mask for local redraw mode."
    )
    parser.add_argument(
        "--key-file",
        type=Path,
        default=DEFAULT_KEY_FILE,
        help=f"APIYi key file (default: {DEFAULT_KEY_FILE}).",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"OpenAI-compatible API base URL (default: {DEFAULT_BASE_URL}).",
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL, help=f"Image model (default: {DEFAULT_MODEL})."
    )
    parser.add_argument(
        "--size", default=DEFAULT_SIZE, help=f"Output size (default: {DEFAULT_SIZE})."
    )
    parser.add_argument(
        "--quality",
        choices=("auto", "low", "medium", "high"),
        default=DEFAULT_QUALITY,
        help=f"Output quality (default: {DEFAULT_QUALITY}).",
    )
    parser.add_argument(
        "--output-format",
        choices=("png", "jpeg", "webp"),
        default=DEFAULT_OUTPUT_FORMAT,
        help=f"Output format (default: {DEFAULT_OUTPUT_FORMAT}).",
    )
    parser.add_argument(
        "--output-compression",
        type=int,
        default=DEFAULT_OUTPUT_COMPRESSION,
        help=f"JPEG/WebP compression 0-100 (default: {DEFAULT_OUTPUT_COMPRESSION}).",
    )
    parser.add_argument(
        "--timeout", type=int, default=360, help="Request timeout in seconds (default: 360)."
    )
    return parser.parse_args()


def read_prompt(args):
    if args.prompt is not None:
        return args.prompt
    return args.prompt_file.read_text(encoding="utf-8").strip()


def read_api_key(key_file):
    try:
        api_key = key_file.read_text(encoding="utf-8").strip().splitlines()[0]
    except (FileNotFoundError, IndexError):
        raise SystemExit(f"Put your APIYi key on the first line of {key_file}.")

    if not api_key or api_key == "sk-paste-your-apiyi-key-here":
        raise SystemExit(f"Replace the placeholder in {key_file} with your APIYi key.")
    return api_key


def error_message(body):
    try:
        payload = json.loads(body.decode("utf-8", errors="replace"))
        return str(payload.get("error", {}).get("message") or payload)[:500]
    except json.JSONDecodeError:
        return body.decode("utf-8", errors="replace")[:500]


def multipart_body(fields, files):
    boundary = "----CodexApiYi" + uuid.uuid4().hex
    chunks = []

    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                str(value).encode(),
                b"\r\n",
            ]
        )

    for field_name, file_path in files:
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                (
                    f'Content-Disposition: form-data; name="{field_name}"; '
                    f'filename="{file_path.name}"\r\n'
                ).encode(),
                f"Content-Type: {content_type}\r\n\r\n".encode(),
                file_path.read_bytes(),
                b"\r\n",
            ]
        )

    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def main():
    args = parse_args()
    if not 0 <= args.output_compression <= 100:
        raise SystemExit("--output-compression must be between 0 and 100.")

    api_key = read_api_key(args.key_file)

    prompt = read_prompt(args)
    if not prompt:
        raise SystemExit("The image prompt cannot be empty.")
    if args.mask and not args.references:
        raise SystemExit("--mask requires at least one --reference image.")

    common_fields = {
        "model": args.model,
        "prompt": prompt,
        "size": args.size,
        "quality": args.quality,
        "output_format": args.output_format,
    }
    if args.output_format in ("jpeg", "webp"):
        common_fields["output_compression"] = args.output_compression

    if args.references:
        endpoint = args.base_url.rstrip("/") + "/images/edits"
        files = [("image[]", reference) for reference in args.references]
        if args.mask:
            files.append(("mask", args.mask))
        body, content_type = multipart_body(common_fields, files)
    else:
        endpoint = args.base_url.rstrip("/") + "/images/generations"
        common_fields["n"] = 1
        body = json.dumps(common_fields).encode("utf-8")
        content_type = "application/json"

    request = Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": content_type,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=args.timeout) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise SystemExit(f"Image API returned HTTP {exc.code}: {error_message(exc.read())}")
    except URLError as exc:
        raise SystemExit(f"Image API request failed: {exc.reason}")

    try:
        encoded_image = payload["data"][0]["b64_json"]
        if encoded_image.startswith("data:"):
            encoded_image = encoded_image.split(",", 1)[1]
        image = base64.b64decode(encoded_image, validate=True)
    except (KeyError, IndexError, TypeError, ValueError, binascii.Error) as exc:
        raise SystemExit(f"Image API response did not contain a valid data[0].b64_json: {exc}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(image)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
