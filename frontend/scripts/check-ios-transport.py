"""Check the source or built iOS plist before shipping the download client."""

import plistlib
import sys
from pathlib import Path


plist_path = Path(sys.argv[1]) if len(sys.argv) > 1 else (
    Path(__file__).resolve().parents[1] / "ios/App/App/Info.plist"
)
with plist_path.open("rb") as source:
    plist = plistlib.load(source)

ats = plist.get("NSAppTransportSecurity", {})
server = ats.get("NSExceptionDomains", {}).get("100.80.105.62", {})
if server.get("NSExceptionAllowsInsecureHTTPLoads") is not True:
    sys.exit("Missing native HTTP exception for the Tailscale download server (100.80.105.62)")
if any(ats.get(key) for key in (
    "NSAllowsArbitraryLoads", "NSAllowsArbitraryLoadsInWebContent", "NSAllowsArbitraryLoadsForMedia",
)):
    sys.exit("Global ATS bypass must not be enabled")

print("iOS transport check passed: native HTTP allowed for 100.80.105.62; global ATS protections retained")
