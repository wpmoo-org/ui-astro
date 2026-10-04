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


SDK_SHA = "03b3a082a90681a1ebf8c3d3a5ae03dee0bae8146a3430e07b21a3ead61b8141"
PINS = {"astro": "7.3.3", "@wpmoo/ui": "1.0.0", "bootstrap": "5.3.8",
        "@astrojs/mdx": "8.0.2", "@astrojs/check": "0.9.10", "typescript": "6.0.3"}
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
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == "a":
            self.anchor = {**attrs, "text": "", "paragraph": False}
            self.anchors.append(self.anchor)
        if tag == "p" and self.anchor is not None:
            self.anchor["paragraph"] = True

    def handle_endtag(self, tag):
        if tag == "a":
            self.anchor = None

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
        "tag": ("tag/astro", "schlagwort/astro"), "sector": ("foundation", "grundlagen"),
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
            require(canonical == ["https://pilot.example.test" + route["href"]], "canonical identity differs")
            require(alternates == {locale: "https://pilot.example.test" + href for locale, href in pair.items()}, "translation alternate differs")
        for locale, href in pair.items():
            require(any(a["text"].strip() == locale.upper() and a.get("href") == href for a in doc.anchors), "translation control differs")
        if route["key"] in ("enhanced", "native"):
            label = "Native Seite öffnen" if route["locale"] == "de" else "Explore the native page"
            controls = [a for a in doc.anchors if a["text"].strip() == label and "btn" in a.get("class", "").split()]
            target_key = "native" if route["key"] == "enhanced" else "home"
            target = next(r["href"] for r in expected.values() if r["key"] == target_key and r["locale"] == route["locale"])
            require(len(controls) == 1 and controls[0].get("href") == target, "literal Action label/target differs")
        dates = [tag.get("datetime") for tag in doc.find("time")]
        if route["key"] in ("announcement", "update", "archive", "category", "tag", "sector"):
            require(bool(dates), "published ISO date missing")
        require(all(date == "2026-10-01T10:00:00.000Z" for date in dates), "ISO date changed with display locale")
        observations[name] = {"href": route["href"], "locale": route["locale"], "canonical": canonical[0] if canonical else None,
                              "alternates": [{"locale": locale, "href": href} for locale, href in sorted(alternates.items())],
                              "links": sorted(a["href"] for a in doc.anchors if a.get("href")), "dates": dates, "inset": inset}
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
            require(record["sha256"] == SDK_SHA and len(actual) == 132, "foundation archive checkpoint differs")
        elif name == "@wpmoo/astro-theme-pilot":
            require(len(actual) == 14 and manifest["peerDependencies"] == {"@wpmoo/astro": "0.1.0", "astro": "7.3.3"}, "theme archive ownership/peers differ")


def phase_artifacts(proof, phase):
    result = dict(proof["artifacts"])
    if phase == "updated":
        result["@wpmoo/astro-theme-pilot"] = proof["update_artifact"]
    return result


def verify_theme_update(root, proof):
    baseline = proof["artifacts"]["@wpmoo/astro-theme-pilot"]
    updated = proof["update_artifact"]
    for record in (baseline, updated):
        verify_archives(root, {"@wpmoo/astro-theme-pilot": record})
    require(baseline["filename"] != updated["filename"] and baseline["integrity"] != updated["integrity"], "theme update must have a separate archive identity")
    require(baseline["manifest"]["version"] == "0.1.0" and updated["manifest"]["version"] == "0.1.1", "theme update version differs")
    require(set(baseline["files"]) == set(updated["files"]), "theme update inventory differs")
    changed = {name for name, digest in updated["files"].items() if digest != baseline["files"][name]}
    require(changed == {"package.json", "src/preferences.js"}, "theme patch changed unrelated files")


def verify_profile(root, profile, artifacts, inset="py-2"):
    directory = owned(root, profile["directory"])
    require(profile["authored_before"] == profile["authored_after"] == profile["authored_sha256"], "authored source changed")
    for name, digest in profile["authored_sha256"].items():
        require(sha(owned(directory, name)) == digest, "authored bytes differ: " + name)
    require(sha(directory / "package.json") == profile["manifest_sha256"], "manifest hash differs")
    require(sha(directory / "package-lock.json") == profile["lock_sha256"], "lock hash differs")
    manifest = read_json(directory / "package.json")
    lock = read_json(directory / "package-lock.json")
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
        require(set(exports) == {name if key == "." else name + "/" + key[2:] for key in artifact["manifest"]["exports"]}, "public theme/SDK export coverage incomplete")
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


class PilotTests(unittest.TestCase):
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

    def test_update_archive_changes_only_version_and_fallback(self):
        verify_theme_update(ROOT, self.proof)

    def test_unrelated_theme_change_is_rejected_after_archive_rebinding(self):
        proof = copy.deepcopy(self.proof)
        baseline = proof["artifacts"]["@wpmoo/astro-theme-pilot"]
        updated = proof["update_artifact"]
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            shutil.copyfile(ROOT / baseline["filename"], directory / baseline["filename"])
            target = directory / updated["filename"]
            with tarfile.open(ROOT / updated["filename"], "r:gz") as source:
                with tarfile.open(target, "w:gz") as archive:
                    for member in source.getmembers():
                        data = source.extractfile(member).read()
                        if member.name == "package/README.md":
                            data += b"\nUnrelated change.\n"
                        member.size = len(data)
                        archive.addfile(member, io.BytesIO(data))
                        updated["files"][member.name[8:]] = hashlib.sha256(data).hexdigest()
            updated["sha256"] = sha(target)
            updated["integrity"] = "sha512-" + base64.b64encode(hashlib.sha512(target.read_bytes()).digest()).decode()
            verify_archives(directory, {"@wpmoo/astro-theme-pilot": updated})
            with self.assertRaisesRegex(AssertionError, "theme patch changed unrelated files"):
                verify_theme_update(directory, proof)

    def test_update_preserves_all_authored_source_and_urls(self):
        updates = self.proof.get("updates", {})
        require(set(updates) == {"normal", "inherited"}, "actual update phases are absent")
        for rehearsal in updates.values():
            phases = rehearsal["phases"]
            require(set(phases) == {"baseline", "updated", "rolled-back"}, "three update phases required")
            baseline = phases["baseline"]
            for phase in phases.values():
                require(phase["authored_before"] == phase["authored_after"] == baseline["authored_before"], "update changed authored source")
                baseline_urls = {name: {k: v for k, v in item.items() if k != "inset"} for name, item in baseline["output"]["observations"].items()}
                phase_urls = {name: {k: v for k, v in item.items() if k != "inset"} for name, item in phase["output"]["observations"].items()}
                require(phase_urls == baseline_urls, "update changed canonical/alternate/content URLs")
                verify_profile(ROOT, phase, phase_artifacts(self.proof, phase["phase"]), phase["inset"])

    def test_project_override_survives_new_fallback(self):
        updates = self.proof.get("updates", {})
        require(set(updates) == {"normal", "inherited"}, "actual update phases are absent")
        for name, insets in (("normal", ("py-2", "py-2", "py-2")), ("inherited", ("py-3", "py-4", "py-3"))):
            for phase, inset in zip(("baseline", "updated", "rolled-back"), insets):
                record = updates[name]["phases"][phase]
                require(record["inset"] == inset, "theme fallback/project replacement differs")
                verify_rendered(owned(ROOT, record["directory"]), record, inset)

    def test_rollback_restores_manifest_lock_and_installed_version(self):
        updates = self.proof.get("updates", {})
        require(set(updates) == {"normal", "inherited"}, "actual update phases are absent")
        verify_archives(ROOT, {"@wpmoo/astro-theme-pilot": self.proof["update_artifact"]})
        for rehearsal in updates.values():
            baseline = rehearsal["phases"]["baseline"]
            rolled = rehearsal["phases"]["rolled-back"]
            for filename in ("package.json", "package-lock.json"):
                require((owned(ROOT, baseline["directory"]) / filename).read_bytes() == (owned(ROOT, rolled["directory"]) / filename).read_bytes(), "rollback changed manifest/lock bytes")
            require(rolled["output"] == baseline["output"], "rollback output differs from baseline")
            for phase in rehearsal["phases"].values():
                artifact = phase_artifacts(self.proof, phase["phase"])["@wpmoo/astro-theme-pilot"]
                version = "0.1.1" if phase["phase"] == "updated" else "0.1.0"
                require(phase["installed"]["packages"]["@wpmoo/astro-theme-pilot"]["version"] == artifact["manifest"]["version"] == version, "installed theme version differs")

    def test_sealed_runtime_and_retained_runner(self):
        proof = self.proof
        require(proof["schema_version"] == 1 and proof["runtime"]["node"] in ("v22.12.0", "v22.23.2", "v26.8.1"), "runtime evidence differs")
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
        self.mutate("about/index.html", lambda html: html.replace('rel="canonical" href="https://pilot.example.test/about"', 'rel="canonical" href="https://pilot.example.test/services"'), "canonical identity")

    def test_wrong_alternate_is_rejected_after_hash_rebinding(self):
        self.mutate("about/index.html", lambda html: html.replace('hreflang="de" href="https://pilot.example.test/de/ueber-uns"', 'hreflang="de" href="https://pilot.example.test/de/kontakt"'), "translation alternate")

    def test_paragraph_inside_action_is_rejected_after_hash_rebinding(self):
        self.mutate("enhanced/index.html", lambda html: html.replace("Explore the native page", "<p>Explore the native page</p>"), "Action contains paragraph")


if __name__ == "__main__":
    if "--profiles-only" in sys.argv:
        sys.argv.remove("--profiles-only")
        excluded = {"test_update_preserves_all_authored_source_and_urls", "test_project_override_survives_new_fallback", "test_rollback_restores_manifest_lock_and_installed_version", "test_update_archive_changes_only_version_and_fallback", "test_unrelated_theme_change_is_rejected_after_archive_rebinding"}
        suite = unittest.TestSuite(PilotTests(name) for name in unittest.defaultTestLoader.getTestCaseNames(PilotTests) if name not in excluded)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        sys.exit(0 if result.wasSuccessful() else 1)
    unittest.main()
