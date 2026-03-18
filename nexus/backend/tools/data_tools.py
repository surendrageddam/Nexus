import httpx
import re
import os
from typing import Optional


# ─────────────────────────────────────────────
# IP LOOKUP — free, no key
# ─────────────────────────────────────────────
async def ip_to_company(ip: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"http://ip-api.com/json/{ip}",
                params={"fields": "status,org,isp,company,country,regionName,city,query"},
            )
            data = r.json()
            if data.get("status") == "success":
                return {
                    "org": data.get("org", ""),
                    "isp": data.get("isp", ""),
                    "country": data.get("country", ""),
                    "region": data.get("regionName", ""),
                    "city": data.get("city", ""),
                    "raw_ip": ip,
                }
    except Exception as e:
        return {"error": str(e)}
    return {}


# ─────────────────────────────────────────────
# HUNTER.IO — 25 free/month
# ─────────────────────────────────────────────
async def hunter_company_enrichment(domain: str, api_key: str) -> dict:
    if not api_key or not domain:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.hunter.io/v2/companies/find",
                params={"domain": domain, "api_key": api_key},
            )
            data = r.json()
            if "data" in data:
                d = data["data"]
                return {k: v for k, v in {
                    "name": d.get("name"),
                    "domain": domain,
                    "industry": d.get("industry"),
                    "size": _size_range(d.get("size")),
                    "country": d.get("country"),
                    "city": d.get("city"),
                    "founded_year": str(d["founded_year"]) if d.get("founded_year") else None,
                    "description": d.get("description"),
                    "linkedin": d.get("linkedin_url"),
                    "twitter": d.get("twitter"),
                }.items() if v}
    except Exception:
        pass
    return {}


def _size_range(size: Optional[int]) -> Optional[str]:
    if not size:
        return None
    if size < 10: return "1-10 employees"
    if size < 50: return "10-50 employees"
    if size < 200: return "50-200 employees"
    if size < 1000: return "200-1000 employees"
    return "1000+ employees"


# ─────────────────────────────────────────────
# ABSTRACT API — 100 free/month, no credit card
# https://app.abstractapi.com/api/company-enrichment
# ─────────────────────────────────────────────
async def abstract_enrich(domain: str, api_key: str) -> dict:
    if not api_key or not domain:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://companyenrichment.abstractapi.com/v1/",
                params={"api_key": api_key, "domain": domain},
            )
            if r.status_code == 200:
                d = r.json()
                return {k: v for k, v in {
                    "name": d.get("name"),
                    "industry": d.get("industry"),
                    "size": d.get("employees_count") and f"{d['employees_count']} employees",
                    "founded_year": str(d["year_founded"]) if d.get("year_founded") else None,
                    "country": d.get("country"),
                    "city": d.get("city"),
                    "description": d.get("long_description") or d.get("short_description"),
                    "linkedin": d.get("linkedin_url"),
                    "twitter": d.get("twitter_url"),
                    "crunchbase": d.get("crunchbase_url"),
                }.items() if v}
    except Exception:
        pass
    return {}


# ─────────────────────────────────────────────
# WIKIPEDIA — free, unlimited, no key
# Works great for any well-known company
# ─────────────────────────────────────────────
async def wikipedia_lookup(company_name: str) -> dict:
    candidates = [
        company_name,
        company_name + " (company)",
        company_name + " Inc",
        company_name.split()[0],  # first word only as fallback
    ]
    async with httpx.AsyncClient(timeout=6, headers={"User-Agent": "NexusBot/1.0 (research)"}) as client:
        for name in candidates:
            try:
                slug = name.strip().replace(" ", "_")
                r = await client.get(
                    f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
                )
                if r.status_code == 200:
                    data = r.json()
                    # Skip disambiguation pages
                    if data.get("type") == "disambiguation":
                        continue
                    extract = data.get("extract", "")
                    if not extract or len(extract) < 30:
                        continue
                    result = {"description": extract[:400]}
                    # Try to parse founding year from extract
                    year_match = re.search(r"founded in (\d{4})|incorporated in (\d{4})|established in (\d{4})", extract.lower())
                    if year_match:
                        result["founded_year"] = next(g for g in year_match.groups() if g)
                    return result
            except Exception:
                continue
    return {}


# ─────────────────────────────────────────────
# LOGO — uses Google's favicon service (free, reliable, no key)
# Falls back to Clearbit as secondary attempt
# ─────────────────────────────────────────────
def get_logo_url(domain: str) -> Optional[str]:
    if not domain:
        return None
    # Google's favicon service is the most reliable free option
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=64"


# ─────────────────────────────────────────────
# TECH STACK DETECTION — scrapes HTTP headers + HTML
# ─────────────────────────────────────────────
async def detect_tech_stack(domain: str) -> dict:
    url = f"https://{domain}"
    tech = {"crm": None, "marketing": None, "analytics": None, "platform": None, "other": []}
    if not domain:
        return tech
    try:
        async with httpx.AsyncClient(
            timeout=10, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NexusBot/1.0)"},
        ) as client:
            r = await client.get(url)
            headers = {k.lower(): v for k, v in r.headers.items()}
            html = r.text[:30000]
        _detect_from_headers(headers, tech)
        _detect_from_html(html, tech)
    except Exception:
        pass
    return tech


def _detect_from_headers(headers: dict, tech: dict):
    server = headers.get("server", "").lower()
    via = headers.get("via", "").lower()
    xpb = headers.get("x-powered-by", "").lower()
    x_generator = headers.get("x-generator", "").lower()

    if "cloudflare" in server or "cloudflare" in via:
        tech["other"].append("Cloudflare CDN")
    if "nginx" in server:
        tech["other"].append("Nginx")
    if "apache" in server:
        tech["other"].append("Apache")
    if "vercel" in headers.get("x-vercel-id", "").lower():
        tech["platform"] = "Vercel"
    if "shopify" in server or "shopify" in xpb:
        tech["platform"] = "Shopify"
    if "wordpress" in xpb or "wordpress" in x_generator:
        tech["platform"] = "WordPress"
    if "drupal" in x_generator:
        tech["platform"] = "Drupal"
    if "aws" in headers.get("server", "").lower() or "amazonaws" in headers.get("x-amz-cf-id", "").lower():
        tech["other"].append("AWS")


def _detect_from_html(html: str, tech: dict):
    SIGNATURES = {
        "analytics": [
            ("Google Analytics", r"google-analytics\.com|gtag\(|ga\.js|googletagmanager"),
            ("Segment", r"segment\.io|analytics\.js"),
            ("Mixpanel", r"mixpanel\.com"),
            ("Amplitude", r"amplitude\.com"),
            ("Heap", r"heap\.io|heapanalytics"),
            ("Hotjar", r"hotjar\.com"),
            ("Pendo", r"pendo\.io"),
        ],
        "marketing": [
            ("HubSpot", r"hubspot\.com|hs-scripts\.com|hsforms\.com"),
            ("Marketo", r"marketo\.com|mktoresp\.com"),
            ("Pardot", r"pardot\.com"),
            ("Mailchimp", r"mailchimp\.com"),
            ("Intercom", r"intercom\.io|intercomcdn\.com"),
            ("Drift", r"drift\.com"),
            ("Klaviyo", r"klaviyo\.com"),
            ("ActiveCampaign", r"activecampaign\.com"),
        ],
        "crm": [
            ("Salesforce", r"salesforce\.com|force\.com|sfdc"),
            ("HubSpot CRM", r"hubspotforms\.com"),
            ("Zendesk", r"zendesk\.com|zdassets\.com"),
        ],
        "platform": [
            ("WordPress", r"wp-content|wp-includes|wordpress"),
            ("Webflow", r"webflow\.com|\.webflow\.io"),
            ("Wix", r"wix\.com|wixstatic\.com"),
            ("Squarespace", r"squarespace\.com|sqspcdn"),
            ("Shopify", r"shopify\.com|myshopify\.com|cdn\.shopify"),
            ("Next.js", r"_next/static|__NEXT_DATA__"),
            ("Gatsby", r"gatsby-plugin|___gatsby"),
            ("React", r"react\.production\.min\.js|__reactFiber"),
            ("Vue", r"vue\.global|__vue__"),
            ("Angular", r"ng-version|angular\.min\.js"),
        ],
    }
    for category, checks in SIGNATURES.items():
        for name, pattern in checks:
            if re.search(pattern, html, re.IGNORECASE):
                if category == "other":
                    if name not in tech["other"]:
                        tech["other"].append(name)
                elif not tech[category]:
                    tech[category] = name
                break

    # Additional standalone detections for "other"
    OTHER_SIGS = [
        ("Stripe", r"stripe\.com/v3|js\.stripe\.com"),
        ("Twilio", r"twilio\.com"),
        ("Sentry", r"sentry\.io|browser\.sentry-cdn"),
        ("Datadog", r"datadoghq\.com|datadog-rum"),
        ("Elasticsearch", r"elasticsearch"),
        ("Contentful", r"contentful\.com"),
        ("Sanity", r"sanity\.io"),
    ]
    for name, pattern in OTHER_SIGS:
        if re.search(pattern, html, re.IGNORECASE) and name not in tech["other"]:
            tech["other"].append(name)


# ─────────────────────────────────────────────
# DOMAIN GUESSER
# ─────────────────────────────────────────────
async def guess_domain_from_name(company_name: str) -> Optional[str]:
    slug = re.sub(r"[^a-z0-9]", "", company_name.lower().replace(" ", ""))
    words = company_name.lower().split()
    candidates = [
        f"{slug}.com",
        f"{''.join(words[:2])}.com" if len(words) > 1 else f"{slug}.com",
        f"{words[0]}.com" if words else f"{slug}.com",
        f"{slug}.io",
        f"{slug}.ai",
    ]
    # deduplicate preserving order
    seen = set()
    candidates = [c for c in candidates if not (c in seen or seen.add(c))]

    async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
        for domain in candidates:
            try:
                r = await client.head(f"https://{domain}")
                if r.status_code < 500:
                    return domain
            except Exception:
                continue
    return candidates[0]


# ─────────────────────────────────────────────
# MERGE HELPER — merges multiple data dicts, first non-null wins
# ─────────────────────────────────────────────
def merge_company_data(*sources: dict) -> dict:
    """Merge multiple enrichment source dicts. First non-null value for each key wins."""
    merged = {}
    for source in sources:
        for key, value in source.items():
            if value and key not in merged:
                merged[key] = value
    return merged