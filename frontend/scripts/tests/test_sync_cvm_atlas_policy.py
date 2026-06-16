import importlib.util
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch


def load_module():
    script_path = pathlib.Path(__file__).resolve().parents[1] / "sync-cvm-atlas-policy.py"
    spec = importlib.util.spec_from_file_location("sync_cvm_atlas_policy", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load sync-cvm-atlas-policy.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SyncCvmAtlasPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_module()

    def test_derive_hostname_uses_explicit_override(self):
        hostname = self.mod.derive_hostname("tee.example.com", {"base_url": "https://ignored.example.com"})
        self.assertEqual(hostname, "tee.example.com")

    def test_derive_hostname_falls_back_to_base_url(self):
        hostname = self.mod.derive_hostname("", {"base_url": "https://cvm-1.example.com:8443"})
        self.assertEqual(hostname, "cvm-1.example.com")

    def test_resolve_proxy_url_prefers_explicit_value(self):
        proxy = self.mod.resolve_proxy_url("wss://explicit.example.com", {"atlas_proxy_url": "wss://row.example.com"})
        self.assertEqual(proxy, "wss://explicit.example.com")

    def test_resolve_proxy_url_uses_row_value_then_env(self):
        proxy_from_row = self.mod.resolve_proxy_url("", {"atlas_proxy_url": "wss://row.example.com"})
        self.assertEqual(proxy_from_row, "wss://row.example.com")

        with patch.dict("os.environ", {"CVM_ATLAS_PROXY_URL": "wss://env.example.com"}, clear=True):
            proxy_from_env = self.mod.resolve_proxy_url("", {"atlas_proxy_url": None})
            self.assertEqual(proxy_from_env, "wss://env.example.com")

    def test_load_env_file_sets_missing_vars_only(self):
        with tempfile.NamedTemporaryFile("w", delete=False) as handle:
            handle.write("SUPABASE_URL=https://db.example.com\n")
            handle.write("NEXT_PUBLIC_ATLAS_PROXY_URL=\"wss://proxy.example.com\"\n")
            env_path = handle.name

        try:
            with patch.dict("os.environ", {"SUPABASE_URL": "https://already.example.com"}, clear=True):
                self.mod.load_env_file(env_path)
                self.assertEqual(self.mod.os.environ.get("SUPABASE_URL"), "https://already.example.com")
                self.assertEqual(self.mod.os.environ.get("NEXT_PUBLIC_ATLAS_PROXY_URL"), "wss://proxy.example.com")
        finally:
            os.unlink(env_path)

    def test_fetch_target_cvm_resolves_from_user_assignment(self):
        with patch.object(self.mod, "request_json") as mock_request:
            mock_request.side_effect = [
                [{"user_id": "user-1", "cvm_instance_id": "cvm-1"}],
                [
                    {
                        "id": "cvm-1",
                        "slug": "test-cvm",
                        "base_url": "https://cvm-1.example.com",
                        "atlas_proxy_url": None,
                        "atlas_policy": None,
                    }
                ],
            ]

            row = self.mod.fetch_target_cvm(
                base_url="https://supabase.example.com",
                service_role_key="service-role",
                cvm_id=None,
                slug=None,
                user_id="user-1",
                timeout=30,
            )

            self.assertEqual(row["id"], "cvm-1")
            first_call = mock_request.call_args_list[0]
            second_call = mock_request.call_args_list[1]
            self.assertEqual(first_call.kwargs["path"], "/rest/v1/user_cvm_assignments")
            self.assertEqual(second_call.kwargs["path"], "/rest/v1/cvm_instances")


if __name__ == "__main__":
    unittest.main()
