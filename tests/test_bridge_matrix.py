"""Independent bounded reader for bridge matrix receipts; no product code imports."""

import hashlib
import json
from pathlib import Path
import re
import sys
import tarfile
import tempfile
import unittest

CONSUMERS = ['default', 'theme', 'ui-only', 'page-only', 'post-only', 'mdx', 'external-plugin', 'taxonomy', 'external-taxonomy', 'content-editing', 'not-found', 'not-found-host']
STARTER = ['en-category', 'de-category', 'en-short', 'de-short', 'en-root', 'de-root']


def validate_bridge_matrix(report, evidence):
    suite = report['suite']
    expected = CONSUMERS if suite == 'consumers' else STARTER if suite == 'starter' else []
    assert expected and report['native_exit'] == 0
    assert [row['id'] for row in report['profiles']] == expected
    assert all(row['passed'] is True for row in report['profiles'])
    assert all(value is True for value in report['assertions'].values())
    request = evidence['request']
    result = evidence['result']
    assert list(result['profiles']) == expected
    artifact = request['artifacts']['@wpmoo/astro']
    assert artifact['manifest']['version'] == '0.1.0'
    assert len(artifact['files']) == 169
    assert all(re.fullmatch('[0-9a-f]{64}', digest) for digest in artifact['files'].values())
    for name in expected:
        profile = result['profiles'][name]
        assert profile['authored_before'] == profile['authored_after']
        assert profile['authored_before']
        commands = profile['steps'] if suite == 'consumers' else profile['commands']
        assert all(commands[step]['exit_code'] == 0 for step in ('install', 'check', 'build'))
        if suite == 'consumers':
            assert profile['archive_sha256'] == artifact['sha256']
            assert profile['dist']
        else:
            assert profile['installed']['packages']['@wpmoo/astro']['files'] == artifact['files']
            assert profile['output']['html'] and profile['output']['observations']
    if suite == 'consumers':
        assert result['incompatible_peer']['code'] == 'ERESOLVE'
        assert result['incompatible_peer']['exit_code'] != 0
    else:
        assert request['preparation']['breadcrumbProfile'] == report['preparation']['variant']
        assert 'prepared-copy' in report['preparation']['scope']
    return len(expected)


def read_and_validate(root):
    root = Path(root)
    report = json.loads((root/'report.json').read_text())
    request = json.loads((root/'evidence/request.json').read_text())
    result_file = 'runner-result.json' if report['suite'] == 'consumers' else 'proof.json'
    result = json.loads((root/'evidence'/result_file).read_text())
    for artifact in request['artifacts'].values():
        path = root/'evidence'/artifact['filename']
        assert path.stat().st_size <= 64*1024**2
        assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact['sha256']
        with tarfile.open(path, 'r:gz') as archive:
            actual = {}
            for member in archive:
                assert member.isfile() and member.name.startswith('package/')
                assert '..' not in Path(member.name).parts and member.size <= 64*1024**2
                name = member.name[len('package/'):]
                assert name not in actual
                actual[name] = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
            assert actual == artifact['files']
    return validate_bridge_matrix(report, {'request':request,'result':result})


class BridgeReaderTests(unittest.TestCase):
    def fixture(self):
        sdk = dict(manifest={'version':'0.1.0'},sha256='a'*64, files={str(i):'b'*64 for i in range(169)})
        profiles = {name:dict(authored_before={'src/a':'x'},authored_after={'src/a':'x'},steps={step:{'exit_code':0} for step in ('install','check','build')},archive_sha256='a'*64,dist={'index.html':'c'*64}) for name in CONSUMERS}
        report = dict(suite='consumers',native_exit=0,profiles=[{'id':name,'passed':True} for name in CONSUMERS],assertions={'complete':True})
        evidence = {'request':{'artifacts':{'@wpmoo/astro':sdk}},'result':{'profiles':profiles,'incompatible_peer':{'code':'ERESOLVE','exit_code':1}}}
        return report,evidence

    def test_complete_native_contract_and_tampering(self):
        report,evidence = self.fixture()
        self.assertEqual(validate_bridge_matrix(report,evidence),12)
        evidence['result']['profiles']['default']['authored_after']={'src/a':'changed'}
        with self.assertRaises(AssertionError):
            validate_bridge_matrix(report,evidence)

    def test_missing_profile_and_installed_archive_inventory(self):
        report,evidence = self.fixture()
        evidence['request']['artifacts']['@wpmoo/astro']['files'].pop('0')
        with self.assertRaises(AssertionError):
            validate_bridge_matrix(report,evidence)
        report,evidence = self.fixture()
        report['profiles'].pop()
        with self.assertRaises(AssertionError):
            validate_bridge_matrix(report,evidence)


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] != '-v':
        print(str(read_and_validate(sys.argv[1]))+' profiles independently verified')
    else:
        unittest.main()
