# Test BAM Files

## Creating a test BAM file

If you have samtools installed, you can create a test BAM file:

```bash
# Convert the included SAM file to BAM
samtools view -bS test.sam > test.bam
samtools index test.bam
```

## Alternative test files

You can also download small test BAM files:

1. **samtools test file**: https://github.com/samtools/samtools/raw/develop/test/dat/mpileup.1.bam
2. **Small ENCODE file**: http://hgdownload.cse.ucsc.edu/goldenPath/hg19/encodeDCC/wgEncodeUwRepliSeq/wgEncodeUwRepliSeqBg02esG1bAlnRep1.bam

## Usage in development

The visualization is currently configured to try loading from the samtools test repository. If you have issues with CORS or missing index files, you can:

1. Download a test BAM file locally
2. Place it in this `public/` directory
3. Update the `datasetUrl` in `src/App.vue` to point to `/test.bam`
