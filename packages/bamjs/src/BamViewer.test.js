import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the @gmod/bam module to avoid ES module issues in tests
vi.mock("@gmod/bam", () => ({
    BamFile: vi.fn(() => ({
        getHeader: vi.fn().mockResolvedValue({
            version: "1.6",
            sortOrder: "coordinate",
            references: [
                { name: "chr7", length: 159138663 },
                { name: "chrM", length: 16569 },
            ],
            readGroups: [],
            programs: [],
        }),
        getRecordsForRange: vi.fn().mockResolvedValue([
            {
                name: "test_read_1",
                refName: "chr7",
                start: 1000,
                end: 1050,
                cigar: "50M",
                seq: "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC",
                qual: "JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ",
                flags: 99,
                mapq: 60,
                tags: { AS: 50, XS: 10, NM: 0, MD: "50" },
            },
        ]),
    })),
}));

// Import our BamViewer class
async function importBamViewer() {
    const module = await import("./main.js");
    return module.BamViewer || window.BamViewer;
}

describe("BamViewer", () => {
    let container;
    let BamViewer;

    beforeEach(async () => {
        // Create a container element for testing
        container = document.createElement("div");
        document.body.appendChild(container);

        // Import BamViewer class
        BamViewer = await importBamViewer();
    });

    afterEach(() => {
        // Clean up
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    it("renders properly with mock data", async () => {
        const viewer = new BamViewer(container, {
            datasetUrl: "http://example.com/test.bam",
            settings: {
                max_records: 100,
                region_start: 0,
                region_end: 10000,
            },
        });

        // Wait for the viewer to finish loading
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(container.textContent).toContain("BAM Header Information");
    });

    it("displays loading message initially", () => {
        // Create viewer but don't wait for async operations
        const viewer = new BamViewer(container, {
            datasetUrl: "http://example.com/test.bam", // Use HTTP URL to trigger async loading
        });

        // Should show loading initially since HTTP requests are async
        expect(container.textContent).toContain("Loading BAM file");
    });

    it("handles missing settings gracefully", async () => {
        const viewer = new BamViewer(container, {
            datasetUrl: "http://example.com/test.bam",
        });

        // Wait for the viewer to finish loading
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(container.textContent).toContain("BAM Header Information");
    });

    it("formats records correctly", async () => {
        const viewer = new BamViewer(container, {
            datasetUrl: "http://example.com/test.bam",
        });

        // Test formatRecord method directly
        const mockRecord = {
            name: "test_read",
            refName: "chr1",
            start: 1000,
            end: 1050,
            cigar: "50M",
            seq: "ATCG",
            qual: "JJJJ",
            flags: 99,
            mapq: 60,
            tags: { AS: 50 },
        };

        const formatted = viewer.formatRecord(mockRecord);

        expect(formatted.name).toBe("test_read");
        expect(formatted.refName).toBe("chr1");
        expect(formatted.start).toBe(1000);
        expect(formatted.end).toBe(1050);
        expect(formatted.flags).toContain("paired");
        expect(formatted.flags).toContain("proper_pair");
    });

    it("formats header correctly", async () => {
        const viewer = new BamViewer(container, {
            datasetUrl: "http://example.com/test.bam",
        });

        const mockHeader = {
            version: "1.6",
            sortOrder: "coordinate",
            references: [
                { name: "chr1", length: 248956422 },
                { name: "chr2", length: 242193529 },
            ],
            readGroups: [{ id: "HG001", sample: "NA12878" }],
            programs: [{ id: "bwa", name: "bwa", version: "0.7.17" }],
        };

        const formatted = viewer.formatHeader(mockHeader);

        expect(formatted).toContain("BAM Header Information");
        expect(formatted).toContain("Version: 1.6");
        expect(formatted).toContain("Sort Order: coordinate");
        expect(formatted).toContain("chr1 (length: 248956422)");
        expect(formatted).toContain("ID: HG001");
        expect(formatted).toContain("ID: bwa");
    });
});
