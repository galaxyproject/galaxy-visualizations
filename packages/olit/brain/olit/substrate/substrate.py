"""The substrate: local compute, Galaxy, the catalog and the LLM, behind one gate."""

import copy

from .catalog import Catalog
from .galaxy_http import GalaxyHttp
from .llm import Llm
from .local import LocalPython
from .manifest import CapabilityManifest


class Substrate:
    def __init__(self, config):
        self.config = config
        self.manifest = CapabilityManifest(config.get("capabilities"))
        self.local = LocalPython(self.manifest)
        self.llm = Llm(config, self.manifest)
        self.galaxy = GalaxyHttp(config, self.manifest)
        self.catalog = Catalog(config, self.manifest)

    async def init(self):
        await self.catalog.init()
        await self.llm.init()
        return self

    def scoped(self, capabilities):
        """A narrower view: the intersection of this manifest with `capabilities`."""
        view = copy.copy(self)
        view.manifest = self.manifest.intersect(capabilities)
        view.local = self.local.scoped(view.manifest)
        view.llm = self.llm.scoped(view.manifest)
        view.galaxy = self.galaxy.scoped(view.manifest)
        view.catalog = self.catalog.scoped(view.manifest)
        return view
