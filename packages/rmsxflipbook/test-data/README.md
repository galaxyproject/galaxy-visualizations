# RMSX Flipbook Test Data

`example.rmsx.json` is the bundled single-chain 1UBQ/`mon_sys` development
fixture.

`protease-multichain.rmsx.json` is a nine-slice viewer manifest generated from
the RMSX repository's two-chain protease fixtures:

- `test_files/protease_backbone.pdb`, SHA256
  `45f98d39a5507cdf8b86a19b05147d053c054cb88f0f04b054c57aa322feddfe`
- `test_files/short_protease_backbone.dcd`, SHA256
  `bd6207f770e8362725f2bfcf41039af5a7864871c4f6e6bd48b8eb1f2d7a4bc3`
- RMSX revision `32c012f49bfb19fa851ab09ff5fe36825c7a229a`

The manifest contains 198 C-alpha residues across chains A and B in each of
nine timepoints. `protease-multichain-row.png` is its Playwright baseline. The
multi-chain test also inspects the rendered canvas and requires nine distinct,
non-overlapping molecular clusters aligned in one horizontal row.

The source RMSX repository and these derived test artifacts are distributed
under the MIT License.
