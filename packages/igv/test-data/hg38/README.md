# hg38 test fixtures

The Playwright test serves these files in place of the network URLs igv requests for hg38. Fetched on 2026-10-29.

| File                  | Source                                                                       | Reduced to                                                                           |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `genomes.json`        | https://s3.amazonaws.com/igv.org.genomes/genomes.json                        | the `hg38` entry                                                                     |
| `igv-genomes.json`    | none                                                                         | an empty list, in place of https://igv.org/genomes/genomes3.json                     |
| `hg38.2bit`           | https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.2bit            | bytes 0-10559: header and sequence index, no sequence                                |
| `hg38.chrom.sizes`    | https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.chrom.sizes     | the 24 chromosomes of `chromosomeOrder`                                              |
| `hg38_alias.tab`      | none                                                                         | generated `chrN` to `N` aliases for the same 24 chromosomes                          |
| `cytoBandIdeo.txt.gz` | https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBandIdeo.txt.gz | the same 24 chromosomes                                                              |
| `ncbiRefSeq.txt.gz`   | https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/ncbiRefSeq.txt.gz   | 677 transcripts: chr1 starting below 1 Mb, and the first 25 of each other chromosome |

The 677 transcripts stay under igv's whole-genome limit of 10,000 features, above which igv samples features at random.

## Credits

hg38 (GRCh38, GCA_000001405.15) data from the UCSC Genome Browser (https://genome.ucsc.edu), freely usable under UCSC's terms (https://genome.ucsc.edu/license/). The sequence index is from the Genome Reference Consortium via NCBI GenBank, and `ncbiRefSeq` is from NCBI RefSeq; NCBI places no restrictions on their use or distribution (https://www.ncbi.nlm.nih.gov/home/about/policies/).

Casper J et al. The UCSC Genome Browser database: 2026 update. Nucleic Acids Res. 2026;54(D1):D1331-D1335. doi:10.1093/nar/gkaf1250

The `genomes.json` entry is from igvteam's genome list (https://github.com/igvteam/igv-data), MIT License, Copyright (c) 2025 igvteam.

```text
MIT License

Copyright (c) 2025 igvteam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
