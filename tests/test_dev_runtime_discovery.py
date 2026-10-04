"""Exercise runtime URL discovery without contacting a development server."""
from io import BytesIO
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import test_dev_runtime_build as runtime


class DevRuntimeDiscovery(unittest.TestCase):
    def responses(self, prefix):
        layout = f"{prefix}/src/layouts/Layout.astro?astro&type=script&index=0&lang.ts"
        bootstrap = f"{prefix}/src/runtime/bootstrap.js"
        moo = f"{prefix}/src/runtime/moo-ui.js"
        public_bootstrap = f"{prefix}/node_modules/bootstrap/dist/js/bootstrap.esm.js?v=before"
        public_moo = f"{prefix}/node_modules/@wpmoo/ui/dist/js/moo-ui.js?v=before"
        return {
            "/": f'<script type="module" src="{layout.replace("&", "&amp;")}"></script>',
            layout: f'import "{bootstrap}"; import MooUI from "{moo}";',
            bootstrap: f'import * as bootstrap from "{public_bootstrap}";',
            moo: f'export * from "{public_moo}"; export {{ default }} from "{public_moo}";',
        }, {runtime.BASE + public_bootstrap, runtime.BASE + public_moo}

    def discover(self, responses):
        def read(url, timeout):
            self.assertEqual(timeout, 15)
            path = url.removeprefix(runtime.BASE)
            if path not in responses:
                raise HTTPError(url, 404, "Not Found", {}, None)
            return BytesIO(responses[path].encode("utf-8"))

        with patch.object(runtime, "urlopen", side_effect=read):
            return runtime.DevRuntimeBuild().runtime_urls()

    def test_discovers_external_sdk_and_hoisted_runtime_urls(self):
        responses, expected = self.responses("/@fs/app/workspace/packages/astro")
        self.assertEqual(self.discover(responses), expected)

    def test_preserves_app_relative_runtime_urls(self):
        responses, expected = self.responses("")
        self.assertEqual(self.discover(responses), expected)

    def test_missing_facade_cannot_pass_runtime_preservation(self):
        responses, _ = self.responses("/@fs/app/workspace/packages/astro")
        layout = next(path for path in responses if "Layout.astro" in path)
        responses[layout] = 'import "/@fs/app/workspace/packages/astro/src/runtime/bootstrap.js";'
        with self.assertRaisesRegex(AssertionError, "moo-ui"):
            self.discover(responses)


if __name__ == "__main__":
    unittest.main()
