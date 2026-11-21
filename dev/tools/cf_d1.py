#!/usr/bin/env python3
"""Run SQL on the Battlechurch D1 databases through the Cloudflare API.

  python3 dev/tools/cf_d1.py preview "SELECT id, email, updated_at FROM players"
  python3 dev/tools/cf_d1.py prod --file db/schema.sql
  python3 dev/tools/cf_d1.py prod "SELECT * FROM errors ORDER BY at DESC LIMIT 20"

prod = battlechurch-saves (test.battlechurch.com / main),
preview = battlechurch-saves-preview (branch previews).
Auth: CLOUDFLARE_API_TOKEN if set; in Claude cloud sessions the network proxy
adds the saved token automatically. Uses curl (respects the proxy settings).
"""
import json
import os
import subprocess
import sys

ACCOUNT = "7d76d8f3ced460d79786bc17a1bf389f"
DATABASES = {
    "prod": "adeb9512-322a-431d-bdf9-80543d580f35",
    "preview": "20a8846c-f37d-44cb-a232-002813d412a1",
}


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in DATABASES:
        print(__doc__)
        sys.exit(2)
    if sys.argv[2] == "--file":
        sql = open(sys.argv[3]).read()
    else:
        sql = sys.argv[2]
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DATABASES[sys.argv[1]]}/query"
    cmd = ["curl", "-s", "-X", "POST", url, "-H", "Content-Type: application/json",
           "--data-binary", json.dumps({"sql": sql})]
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if token:
        cmd += ["-H", f"Authorization: Bearer {token}"]
    out = json.loads(subprocess.check_output(cmd))
    if not out.get("success"):
        print(json.dumps(out.get("errors"), indent=2))
        sys.exit(1)
    for stmt in out.get("result", []):
        for row in stmt.get("results", []):
            print(json.dumps(row))
        meta = stmt.get("meta", {})
        print(f"-- {meta.get('rows_read', 0)} read, {meta.get('changes', 0)} changed")


if __name__ == "__main__":
    main()
