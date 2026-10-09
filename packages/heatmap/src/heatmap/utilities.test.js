import { openLink } from "./utilities.js";

let opened;
beforeEach(() => {
    opened = vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => opened.mockRestore());

test.each([
    "https://www.uniprot.org/uniprot/P12345",
    "http://example.org/gene?id=BRCA1",
    "gene?id=BRCA1",
    "/datasets/123/display",
    "//example.org/gene?id=BRCA1",
])("opens %s as before", (url) => {
    openLink(url);
    expect(opened).toHaveBeenCalledWith(url);
});

test.each([
    "javascript:alert(document.domain)",
    "JAVASCRIPT:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "blob:https://example.org/0f9a",
])("does not open %s", (url) => {
    openLink(url);
    expect(opened).not.toHaveBeenCalled();
});
