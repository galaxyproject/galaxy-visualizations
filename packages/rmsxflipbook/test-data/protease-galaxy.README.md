# Fresh Galaxy protease regression

`protease-galaxy.rmsx.json` was produced by the multi-chain Galaxy wrapper
0.1.0+galaxy1 using the unchanged 0.2.3-galaxy0 runtime image. Local Galaxy job
`143c60ce53daf751` succeeded and emitted manifest `06018b79e9d683f8`.

The inputs are the real protease assembly from RMSX 0.1.5, with 790 backbone
atoms and 99 C-alpha residues in each original chain A and B. The compact XTC
preserves 180 uniformly sampled frames and their source timestamps; nine slices
contain 20 frames each. No chain is duplicated or translated. Source hashes,
regeneration commands, and upstream attribution are in the wrapper fixture README.

The RMSX source distribution carries the MIT license and no separate protease-data
notice. Retain its attribution and confirm bundled-data terms during review.
The original full-trajectory protease viewer fixture remains a separate regression.
