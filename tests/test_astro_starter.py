"""Independent reader of retained archives, installed bytes and compiled HTML."""

import base64
import copy
import hashlib
import io
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile
import unittest


SDK_SHA = "b240f8a6b3d68646e86a4c30279e923588fef0cfab7c2367ddfb2c09f8f2b3fc"
PINS = {"astro": "7.3.3", "@wpmoo/ui": "1.0.0", "bootstrap": "5.3.8",
        "@astrojs/mdx": "8.0.2", "@astrojs/check": "0.9.10", "typescript": "6.0.3"}
ARCHIVE_ITEMS = {
    "archive": ("announcement", "update"),
    "category": ("enhanced", "update"),
    "categoryCompany": ("about", "services"),
    "categoryNews": ("announcement", "update"),
    "tag": ("enhanced", "services", "update"),
    "tagMdx": ("enhanced",),
    "tagRelease": ("announcement", "update"),
    "sector": ("about", "announcement", "update"),
    "sectorDevelopment": ("enhanced", "services", "update"),
}
ENTRY_TERMS = {
    "home": (), "contact": (),
    "about": ("categoryCompany", "sector"),
    "services": ("categoryCompany", "tag", "sectorDevelopment"),
    "enhanced": ("category", "tag", "tagMdx", "sectorDevelopment"),
    "announcement": ("categoryNews", "tagRelease", "sector"),
    "update": ("category", "categoryNews", "tag", "tagRelease", "sector", "sectorDevelopment"),
}
ROOT = Path(sys.argv.pop(1)).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else None


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text())


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def owned(root, name):
    path = root / name
    require(not path.is_symlink() and path.resolve().is_relative_to(root.resolve()), "proof path escapes its root")
    return path


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.anchors = []
        self.anchor = None
        self.in_main = False
        self.list_items = []
        self.in_article = False
        self.in_taxonomies = False
        self.taxonomy_metadata_count = 0
        self.container_ids = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag in ("div", "ul"):
            self.container_ids.append(attrs.get("id"))
        if tag == "main":
            self.in_main = True
        if tag == "article" and self.in_main:
            self.in_article = True
        if tag == "dl" and self.in_article and "data-entry-taxonomies" in attrs:
            self.in_taxonomies = True
            self.taxonomy_metadata_count += 1
        if tag == "li":
            self.list_items.append(self.in_main and bool({"page", "post"} & set(attrs.get("class", "").split())))
        if tag == "a":
            self.anchor = {**attrs, "text": "", "paragraph": False, "loop_item": any(self.list_items), "term_link": self.in_taxonomies, "containers": tuple(self.container_ids)}
            self.anchors.append(self.anchor)
        if tag == "p" and self.anchor is not None:
            self.anchor["paragraph"] = True

    def handle_endtag(self, tag):
        if tag == "a":
            self.anchor = None
        if tag in ("div", "ul") and self.container_ids:
            self.container_ids.pop()
        if tag == "li" and self.list_items:
            self.list_items.pop()
        if tag == "main":
            self.in_main = False
        if tag == "article":
            self.in_article = False
        if tag == "dl":
            self.in_taxonomies = False

    def handle_data(self, data):
        if self.anchor is not None:
            self.anchor["text"] += data

    def find(self, name):
        return [attrs for tag, attrs in self.tags if tag == name]


def routes(profile):
    main = profile["mainLanguage"]
    prefixes = {"category": ("category/", "kategorie/"), "short": ("c/", "k/"), "root": ("", "")}[profile["categoryProfile"]]
    pairs = {
        "home": ("", ""), "about": ("about", "ueber-uns"),
        "services": ("services", "leistungen"), "contact": ("contact", "kontakt"),
        "enhanced": ("enhanced", "erweitert"),
        "announcement": ("blog/announcement", "beitraege/ankuendigung"),
        "update": ("blog/project-update", "beitraege/projektupdate"),
        "archive": ("blog", "beitraege"),
        "category": (prefixes[0] + "guides", prefixes[1] + "anleitungen"),
        "categoryCompany": (prefixes[0] + "company", prefixes[1] + "unternehmen"),
        "categoryNews": (prefixes[0] + "news", prefixes[1] + "neuigkeiten"),
        "tag": ("tag/astro", "schlagwort/astro"), "sector": ("foundation", "grundlagen"),
        "tagMdx": ("tag/mdx", "schlagwort/mdx"),
        "tagRelease": ("tag/release", "schlagwort/veroeffentlichung"),
        "sectorDevelopment": ("development", "entwicklung"),
        "native": ("native-action", "native-action"), "error": ("404", "404"),
    }
    result = {}
    for key, pair in pairs.items():
        for locale, tail in zip(("en", "de"), pair):
            address = "/" + "/".join(part for part in ("" if main == locale else locale, tail) if part)
            filename = "index.html" if address == "/" else "404.html" if address == "/404" else address[1:] + "/index.html"
            result[filename] = {"href": address, "locale": locale, "key": key}
    return result


def verify_rendered(directory, profile, inset="py-2"):
    expected = routes(profile)
    output = profile["output"]
    dist = directory / "dist"
    actual_files = {p.relative_to(dist).as_posix() for p in dist.rglob("*") if p.is_file()}
    require(actual_files == set(output["files"]), "complete output file inventory differs")
    require({name for name in actual_files if name.endswith(".html")} == set(expected), "complete route inventory differs")
    for name, digest in output["files"].items():
        require(sha(owned(dist, name)) == digest, "retained output hash differs: " + name)
    by_url = {route["href"]: route for route in expected.values()}
    observations = {}
    for name, route in expected.items():
        path = owned(dist, name)
        require(sha(path) == output["html"][name], "HTML hash differs")
        html = path.read_text()
        doc = Document(html)
        require(len(doc.find("html")) == 1 and doc.find("html")[0]["lang"] == route["locale"], "document language differs")
        require(len([a for a in doc.find("main") if a.get("id") == "main-content"]) == 1, "one main owner required")
        divs = doc.find("div")
        require(len([a for a in divs if a.get("data-moo-document-owner") == "true"]) == 1, "one document owner required")
        require(len([a for a in divs if a.get("data-slot") == "sidebar-wrapper"]) == 1, "Sidebar must be inherited")
        rails = [a for a in divs if "data-page-container" in a]
        require(len(rails) == 1, "one Layout content rail required")
        require([c for c in rails[0]["class"].split() if c.startswith("py-")] == [inset], "conflicting or missing content inset")
        runtime = [a for a in doc.find("script") if a.get("type") == "module" and a.get("src")]
        require(len(runtime) == 1, "one browser runtime required")
        require(runtime[0]["src"].lstrip("/") in actual_files, "runtime asset missing")
        for link in doc.find("link"):
            if link.get("rel") == "stylesheet":
                require(link["href"].lstrip("/") in actual_files, "stylesheet asset missing")
        for anchor in doc.anchors:
            href = anchor.get("href", "")
            if not href or href.startswith("#"):
                continue
            require(href in by_url, "link has no emitted target: " + href)
            if "sidebar-menu-button" in anchor.get("class", "").split():
                require(by_url[href]["locale"] == route["locale"], "sidebar link loses selected language")
            if "btn" in anchor.get("class", "").split():
                require(not anchor["paragraph"], "Action contains paragraph")
        labels = () if route["key"] == "error" else ("Kategorien", "Schlagwörter", "Bereiche") if route["locale"] == "de" else ("Categories", "Tags", "Sectors")
        keys = (("category", "categoryCompany", "categoryNews"), ("tag", "tagMdx", "tagRelease"), ("sector", "sectorDevelopment"))
        taxonomy_navigation = {}
        for label, wanted_keys in zip(labels, keys):
            controls = [tag for tag in doc.find("button") if tag.get("aria-label") == label]
            require(len(controls) == 1 and controls[0].get("aria-controls"), "one taxonomy submenu required: " + label)
            container = controls[0]["aria-controls"]
            require(any(tag.get("id") == container for tag in doc.find("div") + doc.find("ul")), "controlled submenu missing")
            links = sorted(a.get("href") for a in doc.anchors if container in a["containers"])
            wanted = sorted(r["href"] for r in expected.values() if r["key"] in wanted_keys and r["locale"] == route["locale"])
            require(links == wanted, "taxonomy navigation differs: " + label)
            taxonomy_navigation[label] = links
        canonical = [link["href"] for link in doc.find("link") if link.get("rel") == "canonical"]
        alternates = {link["hreflang"]: link["href"] for link in doc.find("link") if link.get("rel") == "alternate"}
        pair = {r["locale"]: r["href"] for r in expected.values() if r["key"] == route["key"]}
        if route["key"] == "error":
            require(not canonical and not alternates, "error has canonical or alternate")
            require(not [a for a in doc.find("script") if a.get("type") == "application/ld+json"], "error must omit article/page metadata")
            text = "Diese Seite fehlt" if route["locale"] == "de" else "Page not found"
            description = "Die angeforderte Seite wurde nicht gefunden." if route["locale"] == "de" else "The page you requested could not be found."
            require(text in html and description in html, "error override/fallback differs")
            home = next(r["href"] for r in expected.values() if r["key"] == "home" and r["locale"] == route["locale"])
            label = "Zur Startseite" if route["locale"] == "de" else "Back to home"
            require(any(a.get("href") == home and a["text"].strip() == label for a in doc.anchors), "localized error recovery differs")
            pair = {r["locale"]: r["href"] for r in expected.values() if r["key"] == "home"}
        else:
            require(canonical == ["https://starter.example.test" + route["href"]], "canonical identity differs")
            require(alternates == {locale: "https://starter.example.test" + href for locale, href in pair.items()}, "translation alternate differs")
        for locale, href in pair.items():
            require(any(a["text"].strip() == locale.upper() and a.get("href") == href for a in doc.anchors), "translation control differs")
        if route["key"] in ("enhanced", "native"):
            label = "Native Seite öffnen" if route["locale"] == "de" else "Explore the native page"
            controls = [a for a in doc.anchors if a["text"].strip() == label and "btn" in a.get("class", "").split()]
            target_key = "native" if route["key"] == "enhanced" else "home"
            target = next(r["href"] for r in expected.values() if r["key"] == target_key and r["locale"] == route["locale"])
            require(len(controls) == 1 and controls[0].get("href") == target, "literal Action label/target differs")
        dates = [tag.get("datetime") for tag in doc.find("time")]
        term_links = []
        if route["key"] in ENTRY_TERMS:
            wanted_terms = ENTRY_TERMS[route["key"]]
            term_links = sorted(a.get("href") for a in doc.anchors if a["term_link"])
            wanted = sorted(r["href"] for r in expected.values() if r["key"] in wanted_terms and r["locale"] == route["locale"])
            require(term_links == wanted, "entry taxonomy links differ: " + route["href"])
            require(doc.taxonomy_metadata_count == (1 if wanted_terms else 0), "taxonomy metadata count differs")
            require(all(a.get("rel") == "tag" and a["text"].strip() for a in doc.anchors if a["term_link"]), "term label/relationship differs")
        items = []
        if route["key"] in ARCHIVE_ITEMS:
            wanted_keys = ARCHIVE_ITEMS[route["key"]]
            wanted = sorted(r["href"] for r in expected.values() if r["key"] in wanted_keys and r["locale"] == route["locale"])
            items = sorted(a.get("href") for a in doc.anchors if a["loop_item"])
            require(items == wanted, "archive membership differs: " + route["href"])
            require(len(dates) == len({"announcement", "update"} & set(wanted_keys)), "published item date count differs")
        elif route["key"] in ("announcement", "update"):
            require(len(dates) == 1, "published ISO date missing")
        require(all(date == "2026-10-01T10:00:00.000Z" for date in dates), "ISO date changed with display locale")
        observations[name] = {"href": route["href"], "locale": route["locale"], "canonical": canonical[0] if canonical else None,
                              "alternates": [{"locale": locale, "href": href} for locale, href in sorted(alternates.items())],
                              "links": sorted(a["href"] for a in doc.anchors if a.get("href")), "dates": dates, "items": items, "termLinks": term_links,
                              "taxonomyNavigation": taxonomy_navigation, "inset": inset}
    require(observations == output["observations"], "recorded HTML observations differ from actual markup")
    return observations


def verify_archives(root, artifacts):
    for name, record in artifacts.items():
        path = owned(root, record["filename"])
        require(sha(path) == record["sha256"], "archive SHA differs")
        require("sha512-" + base64.b64encode(hashlib.sha512(path.read_bytes()).digest()).decode() == record["integrity"], "archive SRI differs")
        with tarfile.open(path, "r:gz") as archive:
            members = archive.getmembers()
            require(all(m.isfile() and m.name.startswith("package/") and ".." not in Path(m.name).parts for m in members), "archive contains unsafe member")
            actual = {m.name[8:]: hashlib.sha256(archive.extractfile(m).read()).hexdigest() for m in members}
            require(len(actual) == len(members) and actual == record["files"], "actual archive inventory differs")
            manifest = json.loads(archive.extractfile("package/package.json").read())
            require(manifest == record["manifest"], "archive manifest differs")
        require(manifest["private"] and manifest["license"] == "MIT", "private MIT package required")
        if name == "@wpmoo/astro":
            require(record["sha256"] == SDK_SHA and len(actual) == 131, "foundation archive checkpoint differs")



def verify_profile(root, profile, artifacts, inset="py-2"):
    require(set(artifacts) == {"@wpmoo/astro"}, "one SDK artifact required")
    directory = owned(root, profile["directory"])
    require(profile["authored_before"] == profile["authored_after"] == profile["authored_sha256"], "authored source changed")
    for name, digest in profile["authored_sha256"].items():
        require(sha(owned(directory, name)) == digest, "authored bytes differ: " + name)
    require(sha(directory / "package.json") == profile["manifest_sha256"], "manifest hash differs")
    require(sha(directory / "package-lock.json") == profile["lock_sha256"], "lock hash differs")
    manifest = read_json(directory / "package.json")
    lock = read_json(directory / "package-lock.json")
    require("@wpmoo/astro-theme-starter" not in manifest["dependencies"] and "node_modules/@wpmoo/astro-theme-starter" not in lock["packages"], "theme dependency forbidden")
    require(all(not item.get("link") for item in lock["packages"].values()), "workspace link forbidden")
    require("workspaces" not in manifest and lock["lockfileVersion"] == 3, "independent npm lock required")
    for name, version in PINS.items():
        require(lock["packages"]["node_modules/" + name]["version"] == version, "dependency pin differs")
    for name, artifact in artifacts.items():
        expected = "file:../" + artifact["filename"]
        installed = lock["packages"]["node_modules/" + name]
        require(manifest["dependencies"][name] == lock["packages"][""]["dependencies"][name] == installed["resolved"] == expected, "workspace/mutable archive dependency")
        require(not installed.get("link") and installed["integrity"] == artifact["integrity"] and installed["version"] == artifact["manifest"]["version"], "installed archive identity differs")
        package_root = directory / "node_modules" / name
        require(not package_root.is_symlink(), "installed source link forbidden")
        actual_names = {p.relative_to(package_root).as_posix() for p in package_root.rglob("*") if p.is_file()}
        require(actual_names == set(artifact["files"]), "installed archive inventory differs")
        for filename, digest in artifact["files"].items():
            require(sha(owned(package_root, filename)) == digest, "actual installed file differs")
        exports = profile["installed"]["packages"][name]["exports"]
        require(set(exports) == {name if key == "." else name + "/" + key[2:] for key in artifact["manifest"]["exports"]}, "public SDK export coverage incomplete")
        require(profile["installed"]["packages"][name]["files"] == artifact["files"], "installed byte receipt differs")
    published = read_json(directory / "node_modules/@wpmoo/astro/contracts/ui-1.0.0-package.json")
    require(published["version"] == "1.0.0", "published Core pin differs")
    for specifier, record in published["exports"].items():
        path = directory / "node_modules/@wpmoo/ui" / record["target"]
        require(sha(path) == record["sha256"] == profile["installed"]["core_files"][specifier], "actual Core public bytes differ")
    require(profile["installed"]["host"] == profile["directory"] + "/node_modules/astro/package.json", "one Astro host required")
    require(len([path for path in lock["packages"] if path.endswith("node_modules/astro")]) == 1, "multiple Astro hosts installed")
    for path, record in profile["installed"]["closure"].items():
        require(lock["packages"][path]["version"] == record["version"] and not lock["packages"][path].get("link"), "installed closure differs")
        require(sha(owned(directory, path + "/package.json")) == record["sha256"], "installed package manifest changed")
    for name, command in profile["commands"].items():
        log = owned(directory, command["log"])
        require(command["exit_code"] == 0 and sha(log) == command["sha256"], "command evidence differs")
        if name == "check":
            text = re.sub(r"\x1b\[[0-9;]*m", "", log.read_text())
            require(all(value in text for value in ("0 errors", "0 warnings", "0 hints")), "configured diagnostics not green")
        if name == "install":
            require(all(flag in command["args"] for flag in ("--offline", "--strict-peer-deps")), "strict offline installation absent")
    verify_rendered(directory, profile, inset)


class StarterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require(ROOT is not None, "pass an actual retained proof root")
        cls.proof = read_json(ROOT / "proof.json")
        cls.request = read_json(ROOT / "request.json")


    def test_actual_retained_archives(self):
        verify_archives(ROOT, self.proof["artifacts"])


    def test_actual_six_profiles(self):
        require(set(self.proof["profiles"]) == {f"{lang}-{kind}" for lang in ("en", "de") for kind in ("category", "short", "root")}, "six profiles required")
        for profile in self.proof["profiles"].values():
            verify_profile(ROOT, profile, self.proof["artifacts"])


    def test_sealed_runtime_and_retained_runner(self):
        proof = self.proof
        require(proof["schema_version"] == 2 and proof["kind"] == "astro-moo-starter" and proof["runtime"]["node"] in ("v22.12.0", "v22.23.2", "v26.8.1"), "runtime evidence differs")
        for name, digest in self.request["scripts_sha256"].items():
            require(sha(owned(ROOT, name)) == digest, "retained runner differs")
        for phase in ("before", "after"):
            container = read_json(ROOT / ("container-" + phase + ".json"))[0]
            require(container["Image"] == proof["container"]["image"], "image differs")
            host = container["HostConfig"]
            require(host["NetworkMode"] == "none" and host["ReadonlyRootfs"] and not host["Privileged"], "sealed isolation differs")
            require(not host.get("PortBindings") and not host.get("VolumesFrom") and not host.get("CapAdd"), "unexpected service/source access")
            mounts = {m["Destination"]: m for m in container["Mounts"]}
            require(set(mounts) == {"/proof", "/cache"} and mounts["/proof"]["RW"] and not mounts["/cache"]["RW"], "sealed mounts differ")
            require(Path(mounts["/proof"]["Source"]).resolve() == ROOT, "actual proof mount differs")
            require(container["Config"]["Entrypoint"] == ["node"] and container["Config"]["Cmd"] == ["/proof/run_packed_consumer.mjs", "/proof/request.json"], "retained command differs")
            if phase == "after":
                require(not container["State"]["Running"] and container["State"]["ExitCode"] == 0, "container did not pass")
        require(proof["acceptance"] == {"http_status": "not-executed", "static_host_selection": "not-executed", "rendered": "pending"}, "offline proof must retain open gates")


    def mutate(self, filename, transform, diagnostic):
        profile = copy.deepcopy(self.proof["profiles"]["en-category"])
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            shutil.copytree(ROOT / profile["directory"] / "dist", directory / "dist")
            path = directory / "dist" / filename
            original = path.read_text()
            mutated = transform(original)
            require(mutated != original, "mutation did not alter actual output")
            path.write_text(mutated)
            # Rebind both output hashes: semantics still must reject the mutation.
            profile["output"]["files"][filename] = sha(path)
            profile["output"]["html"][filename] = sha(path)
            with self.assertRaisesRegex(AssertionError, diagnostic):
                verify_rendered(directory, profile)


    def test_wrong_translated_href_is_rejected_after_hash_rebinding(self):
        self.mutate("about/index.html", lambda html: html.replace('href="/de/ueber-uns"', 'href="/de/about"'), "link has no emitted target")


    def test_wrong_canonical_is_rejected_after_hash_rebinding(self):
        self.mutate("about/index.html", lambda html: html.replace('rel="canonical" href="https://starter.example.test/about"', 'rel="canonical" href="https://starter.example.test/services"'), "canonical identity")


    def test_wrong_alternate_is_rejected_after_hash_rebinding(self):
        self.mutate("about/index.html", lambda html: html.replace('hreflang="de" href="https://starter.example.test/de/ueber-uns"', 'hreflang="de" href="https://starter.example.test/de/kontakt"'), "translation alternate")


    def test_paragraph_inside_action_is_rejected_after_hash_rebinding(self):
        self.mutate("enhanced/index.html", lambda html: html.replace("Explore the native page", "<p>Explore the native page</p>"), "Action contains paragraph")


    def test_unrelated_item_is_rejected_after_hash_rebinding(self):
        # Both URLs exist; the failure must concern membership, not link validity.
        self.mutate("category/guides/index.html", lambda html: re.sub(r'(<li\b[^>]*class="[^"]*\bpage\b[^>]*>[\s\S]*?<a\b[^>]*href=")/enhanced"', r'\1/about"', html), "archive membership differs")


    def test_missing_item_is_rejected_after_hash_rebinding(self):
        self.mutate("category/guides/index.html", lambda html: re.sub(r'<li\b[^>]*class="[^"]*\bpost\b[^>]*>[\s\S]*?</li>', "", html, count=1), "archive membership differs")


    def test_wrong_entry_term_is_rejected_after_hash_rebinding(self):
        self.mutate("enhanced/index.html", lambda html: re.sub(r'(<a\b[^>]*href=")/tag/mdx("[^>]*rel="tag")', r'\1/tag/release\2', html), "entry taxonomy links differ")


    def test_sidebar_term_in_wrong_group_is_rejected_after_hash_rebinding(self):
        self.mutate("enhanced/index.html", lambda html: html.replace('href="/category/company"', 'href="/tag/astro"', 1), "taxonomy navigation differs")


    def test_portable_original_source_is_retained(self):
        require(self.proof["source_sha256"] == self.request["source_sha256"], "source receipt differs")
        for name, digest in self.request["source_sha256"].items():
            require(sha(owned(ROOT / "source", name)) == digest, "portable source bytes differ")
        manifest = read_json(ROOT / "source/package.json")
        require(manifest["name"] == "astro-moo-starter" and manifest["private"], "starter identity differs")
        require(manifest["dependencies"]["@wpmoo/astro"] == "0.1.0", "portable manifest contains local SDK path")
        require("@wpmoo/astro-theme-starter" not in manifest["dependencies"], "portable theme dependency present")
        require(not (ROOT / "source/package-lock.json").exists(), "portable unpublished template contains local lock")

    def test_german_main_uses_localized_urls_and_english_alternates(self):
        for kind, category in (("category", "/kategorie/anleitungen"), ("short", "/k/anleitungen"), ("root", "/anleitungen")):
            profile = self.proof["profiles"]["de-" + kind]
            observed = profile["output"]["observations"]
            require(observed["ueber-uns/index.html"]["href"] == "/ueber-uns", "German main canonical path differs")
            require(observed["en/about/index.html"]["href"] == "/en/about", "English alternate path differs")
            require(observed[category.lstrip("/") + "/index.html"]["href"] == category, "localized category base differs")
            require(observed["ueber-uns/index.html"]["alternates"] == [
                {"locale": "de", "href": "https://starter.example.test/ueber-uns"},
                {"locale": "en", "href": "https://starter.example.test/en/about"},
            ], "German main translated alternate identity differs")
            verify_rendered(owned(ROOT, profile["directory"]), profile)

    def test_taxonomy_archives_and_assigned_links_match_authored_membership(self):
        for profile in self.proof["profiles"].values():
            verify_rendered(owned(ROOT, profile["directory"]), profile)

    def test_mdx_action_has_prepared_locale_href_and_inline_label(self):
        for profile in self.proof["profiles"].values():
            verify_rendered(owned(ROOT, profile["directory"]), profile)
            if profile["categoryProfile"] == "category":
                command = profile["commands"]["mdx"]
                output = owned(ROOT / profile["directory"], command["log"]).read_text()
                for locale in ("en", "de"):
                    require(profile["mainLanguage"] + "/" + locale + ": development asset graph loaded" in output, "MDX development graph not exercised")

    def test_extra_theme_artifact_is_rejected(self):
        profile = self.proof["profiles"]["en-category"]
        changed = dict(self.proof["artifacts"])
        changed["@wpmoo/astro-theme-starter"] = changed["@wpmoo/astro"]
        with self.assertRaisesRegex(AssertionError, "one SDK artifact"):
            verify_profile(ROOT, profile, changed)

    def test_changed_sdk_integrity_is_rejected(self):
        changed = copy.deepcopy(self.proof["artifacts"])
        changed["@wpmoo/astro"]["integrity"] = "sha512-wrong"
        with self.assertRaisesRegex(AssertionError, "archive SRI"):
            verify_archives(ROOT, changed)

    def test_extra_sdk_member_is_rejected_after_archive_rebinding(self):
        original = self.proof["artifacts"]["@wpmoo/astro"]
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            target = directory / original["filename"]
            with tarfile.open(ROOT / original["filename"], "r:gz") as source, tarfile.open(target, "w:gz") as altered:
                for member in source.getmembers():
                    altered.addfile(member, source.extractfile(member))
                member = tarfile.TarInfo("package/src/unexpected.js")
                content = b"export const unexpected = true;\n"
                member.size = len(content)
                altered.addfile(member, io.BytesIO(content))
            changed = copy.deepcopy(original)
            changed["sha256"] = sha(target)
            changed["integrity"] = "sha512-" + base64.b64encode(hashlib.sha512(target.read_bytes()).digest()).decode()
            changed["files"]["src/unexpected.js"] = hashlib.sha256(content).hexdigest()
            with self.assertRaisesRegex(AssertionError, "foundation archive checkpoint"):
                verify_archives(directory, {"@wpmoo/astro": changed})

    def test_dropped_assigned_term_link_is_rejected_after_hash_rebinding(self):
        self.mutate("enhanced/index.html", lambda html: re.sub(r'<a\b[^>]*href="/tag/mdx"[^>]*rel="tag"[^>]*>[\s\S]*?</a>', "", html), "entry taxonomy links differ")

if __name__ == "__main__":
    unittest.main()
