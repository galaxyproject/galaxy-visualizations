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
nine timepoints, per-chain RMSD/RMSF arrays, per-slice time bounds, and logical
chain atom ranges. `protease-multichain-row.png` is the Structures baseline;
the Analysis baselines cover 2000x1100, 1440x900, and 552x993. The multi-chain
test also inspects the rendered canvas and requires nine distinct,
non-overlapping molecular clusters in both chain lanes and the full-assembly
lane before and after synchronized rotation.

The source RMSX repository and these derived test artifacts are distributed
under the MIT License.
