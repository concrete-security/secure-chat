import importlib.util
import pathlib
import unittest


def load_module():
    script_path = pathlib.Path(__file__).resolve().parents[1] / "get-tee-policy-values.py"
    spec = importlib.util.spec_from_file_location("get_tee_policy_values", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load get-tee-policy-values.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GetTeePolicyValuesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_module()

    def test_build_policy_includes_bootchain_os_and_app_compose(self):
        measurements = {
            "mrtd": "mrtd",
            "rtmr0": "rtmr0",
            "rtmr1": "rtmr1",
            "rtmr2": "rtmr2",
        }
        app_compose = '{"docker_compose_file":"services: {}"}'

        policy = self.mod.build_policy(measurements, "os-hash", app_compose)
        self.assertEqual(policy["type"], "dstack_tdx")
        self.assertEqual(policy["expected_bootchain"]["mrtd"], "mrtd")
        self.assertEqual(policy["os_image_hash"], "os-hash")
        self.assertIn("app_compose", policy)

    def test_build_policy_skips_invalid_app_compose(self):
        measurements = {
            "mrtd": "mrtd",
            "rtmr0": "rtmr0",
            "rtmr1": "rtmr1",
            "rtmr2": "rtmr2",
        }

        policy = self.mod.build_policy(measurements, None, "{not-json")
        self.assertNotIn("app_compose", policy)

    def test_parse_event_log_extracts_expected_fields(self):
        event_log = """
        [
          {"event":"os-image-hash","event_payload":"os123"},
          {"event":"compose-hash","event_payload":"compose123"},
          {"event":"app-id","event_payload":"app123"}
        ]
        """
        parsed = self.mod.parse_event_log(event_log)
        self.assertEqual(parsed["os_image_hash"], "os123")
        self.assertEqual(parsed["compose_hash"], "compose123")
        self.assertEqual(parsed["app_id"], "app123")


if __name__ == "__main__":
    unittest.main()
