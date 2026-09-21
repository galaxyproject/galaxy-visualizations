"""Capability manifest: the one contract the substrate enforces, for any scale."""

from olite.exceptions import CapabilityError

# Write is never default; it is granted explicitly and targeted.
DEFAULT_CAPABILITIES = ["llm", "local", "read"]


class CapabilityManifest:
    def __init__(self, capabilities=None):
        # None takes the default; an empty list grants nothing and must stay empty.
        self.granted = set(DEFAULT_CAPABILITIES if capabilities is None else capabilities)

    def intersect(self, capabilities):
        """Narrowing only: a new manifest granting what both allow."""
        if capabilities is None:
            return CapabilityManifest(self.granted)
        return CapabilityManifest(self.granted & set(capabilities))

    def allows(self, capability):
        """True if the manifest grants this capability (None means unrestricted)."""
        if capability is None:
            return True
        return capability in self.granted

    def require(self, capability):
        if not self.allows(capability):
            raise CapabilityError(
                f"Capability '{capability}' not granted",
                details={"granted": sorted(self.granted)},
            )

    def to_list(self):
        return sorted(self.granted)
