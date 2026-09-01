#!/usr/bin/env python3
"""
Build wcs-widgets-upload-v2/home-live.json — the feed behind the Home strip.

Reads {"tasks":[[id,name,status,[clientIds],shoot,startTime,due,delivered],...],
       "clients":{clientId: "Client Name"}} as JSON on stdin.

  python3 home-feed.py            → print the feed
  python3 home-feed.py --publish  → also commit it, needs WCS_GH_TOKEN in the env

The counting rules live here and nowhere else. They are mirrored by
buildHomeFeed() in wcs-invoice-worker/src/index.ts — change both together.
"""
import sys, os, re, json, base64, datetime, zoneinfo, urllib.request, urllib.error

CHI  = zoneinfo.ZoneInfo("America/Chicago")
POST = {"To Be Assigned - Post", "Pre Prod.", "Post Prod.", "Coloring",
        "Rough Cut Done", "Mastering", "Revisions"}
OUT  = {"Done", "Lead"}          # Leads are prospects, not work in flight
REPO = "wcstudios/wcs-widgets"
PATH = "wcs-widgets-upload-v2/home-live.json"


def date_only(v):
    """Shoot times come back as UTC instants; bucket them in Central or an
    evening shoot lands on tomorrow. Date-only values carry no zone — parsing
    2026-09-17 as UTC midnight and formatting in Chicago gives the 16th."""
    if not v:
        return None
    if "T" in v or " " in v:
        return (datetime.datetime
                .fromisoformat(v.replace(" ", "T").replace("Z", "+00:00"))
                .astimezone(CHI).date().isoformat())
    return v[:10]


def time_only(v):
    return (datetime.datetime
            .fromisoformat(v.replace(" ", "T").replace("Z", "+00:00"))
            .astimezone(CHI).strftime("%-I:%M %p"))


def build(rows, clients):
    today = datetime.datetime.now(CHI).date().isoformat()
    diff = lambda a, b: (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days

    tasks = []
    for tid, name, status, rel, shoot, stime, due, delivered in rows:
        named = [clients[c] for c in (rel or []) if c in clients]
        has_dt = bool(shoot) and ("T" in shoot or " " in shoot)
        # "8" turns up in Shoot - Start Time where someone typed the hour only.
        typed_ok = stime and re.search(r"\d", stime) and re.search(r"[:apmAPM]", stime)
        tasks.append({
            "id": tid, "name": name, "status": status,
            "client": named[0] if named else name.split(" - ")[0].strip(),
            "shootDate": date_only(shoot),
            "shootTime": time_only(shoot) if has_dt else (stime if typed_ok else None),
            "due": due[:10] if due else None,
            "delivered": delivered,
        })

    live = [t for t in tasks if t["status"] not in OUT]
    overdue = sorted((dict(t, days=diff(t["due"], today))
                      for t in live if t["due"] and t["due"] < today),
                     key=lambda t: -t["days"])
    upcoming = sorted((t for t in live if t["shootDate"] and t["shootDate"] >= today),
                      key=lambda t: t["shootDate"])
    nxt = upcoming[0] if upcoming else None

    # A ping is a client-side event: they came back with notes, or something
    # shipped. Last Delivered dates both — a task sitting in Revisions came
    # back after the cut it names, so that is the clock on the revision.
    cand = [("rev", "left revisions", t, t["delivered"] or (t["due"] + "T12:00:00Z" if t["due"] else None))
            for t in live if t["status"] == "Revisions"]
    cand += [("del", "delivered", t, t["delivered"])
             for t in tasks if t["delivered"] and diff(date_only(t["delivered"]), today) <= 21]

    seen, pings = set(), []
    for kind, what, t, at in sorted((c for c in cand if c[3]), key=lambda c: c[3], reverse=True):
        if t["id"] in seen:
            continue
        seen.add(t["id"])
        d = diff(date_only(at), today)
        pings.append({"kind": kind, "who": t["client"], "what": what,
                      "task": t["name"], "id": t["id"],
                      "ago": "today" if d <= 0 else f"{d}d"})
        if len(pings) == 3:
            break

    return {
        "updated": datetime.datetime.now(datetime.timezone.utc)
                   .isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "source": "scheduled",
        "tasks": {"open": len(live),
                  "inPost": len([t for t in live if t["status"] in POST]),
                  "overdue": len(overdue)},
        "mostOverdue": ({"name": overdue[0]["name"], "id": overdue[0]["id"],
                         "days": overdue[0]["days"]} if overdue else None),
        "pings": pings,
        "nextShoot": ({"name": nxt["name"], "id": nxt["id"],
                       "date": nxt["shootDate"], "time": nxt["shootTime"]} if nxt else None),
    }


def publish(feed):
    tok = os.environ.get("WCS_GH_TOKEN")
    if not tok:
        sys.exit("WCS_GH_TOKEN is not set.")
    url = f"https://api.github.com/repos/{REPO}/contents/{PATH}"
    hdr = {"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json",
           "User-Agent": "wcs-home-feed", "Content-Type": "application/json"}
    sha = None
    try:
        sha = json.load(urllib.request.urlopen(
            urllib.request.Request(url + "?ref=main", headers=hdr)))["sha"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    body = {"message": f"Live home feed — {feed['tasks']['open']} in flight, "
                       f"{feed['tasks']['overdue']} overdue",
            "content": base64.b64encode(
                json.dumps(feed, indent=1, ensure_ascii=False).encode()).decode(),
            "branch": "main"}
    if sha:
        body["sha"] = sha
    r = urllib.request.urlopen(urllib.request.Request(
        url, method="PUT", headers=hdr, data=json.dumps(body).encode()))
    print("published", r.status, json.load(r)["commit"]["sha"][:8], file=sys.stderr)


if __name__ == "__main__":
    src = json.load(sys.stdin)
    feed = build(src["tasks"], src["clients"])
    print(json.dumps(feed, indent=1, ensure_ascii=False))
    if "--publish" in sys.argv:
        publish(feed)
