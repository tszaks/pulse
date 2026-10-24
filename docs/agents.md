# Using Pulse with agents

Pulse is made for personal agents that run on your own server: agents that load MCP tools from a config file and can call HTTP endpoints. This page shows two ways to connect one.

The Pulse repository does not ship an MCP server. The script below is a small standalone one you copy to your agent's machine. It is about 75 lines, uses only the Python standard library, and speaks MCP over stdio.

## Option 1: MCP (recommended)

Save this as `pulse_mcp.py` on the machine where your agent runs. It exposes three tools.

| Tool | What it does |
|---|---|
| `pulse_query` | Asks a plain-English question about a domain (`POST /v1/query`). Returns the `context_for_agent` text. |
| `pulse_list_sites` | Lists tracked domains (`GET /v1/sites`). |
| `pulse_metrics` | Returns metrics for a domain and period. Looks up the site ID, then calls `GET /v1/sites/:id/metrics`. |

```python
#!/usr/bin/env python3
import os, sys, json, urllib.request

PULSE_BASE = os.environ.get("PULSE_BASE_URL", "https://api.example.com")
PULSE_KEY  = os.environ["PULSE_API_KEY"]
HEADERS = {"Authorization": f"Bearer {PULSE_KEY}", "Content-Type": "application/json"}

TOOLS = [
    {
        "name": "pulse_query",
        "description": "Query web analytics in plain English. Ask things like 'how did example.com do this week?' or 'top pages on example.com this month?'. Returns a reply-ready summary.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "domain": {"type": "string", "description": "Domain to query, e.g. yoursite.com"},
                "question": {"type": "string", "description": "Natural language analytics question"}
            },
            "required": ["domain", "question"]
        }
    },
    {
        "name": "pulse_list_sites",
        "description": "List all websites being tracked.",
        "inputSchema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "pulse_metrics",
        "description": "Get structured metrics for a site.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "domain": {"type": "string"},
                "period": {"type": "string", "enum": ["1d","7d","14d","30d","90d"], "default": "7d"}
            },
            "required": ["domain"]
        }
    }
]

def call(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(PULSE_BASE + path, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def handle(name, args):
    if name == "pulse_list_sites":
        sites = call("GET", "/v1/sites")["sites"]
        return {"content": [{"type": "text", "text": "\n".join(f"- {s['domain']}" for s in sites)}]}
    if name == "pulse_query":
        r = call("POST", "/v1/query", {"domain": args["domain"], "question": args["question"]})
        return {"content": [{"type": "text", "text": r.get("context_for_agent") or r.get("summary")}]}
    if name == "pulse_metrics":
        sites = call("GET", "/v1/sites")["sites"]
        site = next((s for s in sites if s["domain"] == args["domain"]), None)
        if not site: return {"content": [{"type": "text", "text": f"Site {args['domain']} not found."}]}
        r = call("GET", f"/v1/sites/{site['id']}/metrics?period={args.get('period','7d')}")
        return {"content": [{"type": "text", "text": r.get("context_for_agent") or r.get("summary")}]}

for line in sys.stdin:
    if not line.strip(): continue
    try:
        req = json.loads(line)
        method, rid = req.get("method"), req.get("id")
        if method == "initialize":
            resp = {"jsonrpc":"2.0","id":rid,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"pulse","version":"1.0.0"}}}
        elif method == "tools/list":
            resp = {"jsonrpc":"2.0","id":rid,"result":{"tools":TOOLS}}
        elif method == "tools/call":
            resp = {"jsonrpc":"2.0","id":rid,"result":handle(req["params"]["name"],req["params"].get("arguments",{}))}
        elif method and method.startswith("notifications/"): continue
        else:
            resp = {"jsonrpc":"2.0","id":rid,"error":{"code":-32601,"message":"Method not found"}}
        print(json.dumps(resp), flush=True)
    except Exception as e:
        print(json.dumps({"jsonrpc":"2.0","id":None,"error":{"code":-32700,"message":str(e)}}), flush=True)
```

Set two environment variables for the process: `PULSE_API_KEY` (one of your `PULSE_API_KEYS`) and `PULSE_BASE_URL` (the address of your Agent API, no trailing slash).

Register it with your agent. Example for a Hermes `config.yaml`:

```yaml
mcp_servers:
  pulse:
    command: python3
    args:
      - /path/to/pulse_mcp.py
    env:
      PULSE_BASE_URL: https://api.example.com
      PULSE_API_KEY: your-key-here
```

Other MCP clients use their own config format. The server is a plain stdio command, so any client that can start a command with environment variables can run it. Restart your agent after you add it.

## Option 2: direct HTTP

Any agent that can make HTTP requests works. `POST /v1/query` is the simplest call:

```sh
curl -s https://api.example.com/v1/query \
  -H "Authorization: Bearer $PULSE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "question": "how did we do this week?"}'
```

The reply has a `context_for_agent` field. Put it in your agent's context, or send it straight to the user as the answer.

## Tips

- Use `/v1/sites` first if your agent does not know which domains exist.
- For hard questions, let your agent's own model pick the intent and send it as `parsed`. See [api.md](api.md#post-v1query).
- Give each agent its own key in `PULSE_API_KEYS`, so you can remove one without touching the others.
