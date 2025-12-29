import pathlib
import shlex
import subprocess

localisation_file = pathlib.Path(__file__).parent / ".." / "static/chrome/locale/en-US/wikicite.properties"
src_dir = pathlib.Path(__file__).parent / ".." / "src"
lcn_dir= pathlib.Path(__file__).parent / ".." / "Local-Citation-Network"
static_content_dir= pathlib.Path(__file__).parent / ".." / "static/chrome/content"

with open(localisation_file, "r") as f:
	translation_identifiers = [line[:line.index("=")].strip() for line in f.readlines()]

def search_string(translation_string: str, dir: pathlib.Path):
	result = subprocess.call(shlex.split(f"grep -Rnw {dir} -e {translation_string}"), stdout=subprocess.DEVNULL)
	while result != 0 and len(translation_string.split(".")) > 2:
		translation_string = ".".join(translation_string.split(".")[1:])
		result = subprocess.call(shlex.split(f"grep -Rnw {dir} -e {translation_string}"), stdout=subprocess.DEVNULL)
	return result, translation_string

for translation_identifier in translation_identifiers:
	result, found = search_string(translation_identifier, src_dir)
	if result != 0 and translation_identifier.startswith("wikicite.lcn.window."):
		result, found = search_string(translation_identifier.removeprefix("wikicite.lcn.window."), lcn_dir)
	if result != 0 and translation_identifier.startswith("wikicite.prefs"):
		result, found = search_string(translation_identifier, static_content_dir)
	success = "✅" if result == 0 else "❌"

	print(success, translation_identifier, f"({found})")

