import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Tabular from "./Tabular.vue";

describe("Tabular", () => {
    describe("CSV parsing", () => {
        it("parses simple CSV with headers", () => {
            const wrapper = mount(Tabular, {
                props: { content: "a,b,c\n1,2,3\n4,5,6" },
            });
            const headers = wrapper.findAll("th");
            expect(headers.length).toBe(4); // # + 3 columns
            expect(headers[1].text()).toBe("a");
            expect(headers[2].text()).toBe("b");
            expect(headers[3].text()).toBe("c");
        });

        it("parses CSV with quoted fields", () => {
            const wrapper = mount(Tabular, {
                props: { content: 'name,value\n"hello, world",123' },
            });
            const cells = wrapper.findAll("td");
            expect(cells[1].text()).toBe("hello, world");
        });

        it("handles empty CSV", () => {
            const wrapper = mount(Tabular, {
                props: { content: "" },
            });
            const bodyRows = wrapper.findAll("tbody tr");
            expect(bodyRows.length).toBe(0);
        });
    });

    describe("Tab-delimited parsing", () => {
        it("parses tab-delimited data with auto-generated headers", () => {
            const wrapper = mount(Tabular, {
                props: { content: "1\t2\t3\n4\t5\t6" },
            });
            const headers = wrapper.findAll("th");
            expect(headers.length).toBe(4); // # + 3 columns
            expect(headers[1].text()).toBe("col:1");
            expect(headers[2].text()).toBe("col:2");
            expect(headers[3].text()).toBe("col:3");
        });

        it("detects tab delimiter over comma", () => {
            const wrapper = mount(Tabular, {
                props: { content: "a\tb\tc\n1\t2\t3" },
            });
            const headers = wrapper.findAll("th");
            // Tab-delimited files get auto-generated headers
            expect(headers[1].text()).toBe("col:1");
        });
    });

    describe("Comment line skipping", () => {
        it("skips lines starting with #", () => {
            const wrapper = mount(Tabular, {
                props: { content: "# comment\na,b\n1,2" },
            });
            const headers = wrapper.findAll("th");
            expect(headers[1].text()).toBe("a");
        });

        it("skips lines starting with //", () => {
            const wrapper = mount(Tabular, {
                props: { content: "// comment\na,b\n1,2" },
            });
            const headers = wrapper.findAll("th");
            expect(headers[1].text()).toBe("a");
        });

        it("skips multiple comment lines", () => {
            const wrapper = mount(Tabular, {
                props: { content: "# line 1\n# line 2\n// line 3\na,b\n1,2" },
            });
            const headers = wrapper.findAll("th");
            expect(headers[1].text()).toBe("a");
        });

        it("handles comments with leading whitespace", () => {
            const wrapper = mount(Tabular, {
                props: { content: "  # comment\na,b\n1,2" },
            });
            const headers = wrapper.findAll("th");
            expect(headers[1].text()).toBe("a");
        });
    });

    describe("Row truncation", () => {
        it("shows truncation message when data exceeds maxRows", () => {
            const rows = Array.from({ length: 20 }, (_, i) => `${i}`).join("\n");
            const wrapper = mount(Tabular, {
                props: { content: `value\n${rows}`, maxRows: 10 },
            });
            const message = wrapper.find(".bg-sky-50");
            expect(message.exists()).toBe(true);
            expect(message.text()).toContain("Showing");
            expect(message.text()).toContain("10");
        });

        it("does not show truncation message when data fits", () => {
            const wrapper = mount(Tabular, {
                props: { content: "a\n1\n2\n3", maxRows: 10 },
            });
            const message = wrapper.find(".bg-sky-50");
            expect(message.exists()).toBe(false);
        });

        it("limits displayed rows to maxRows", () => {
            const rows = Array.from({ length: 20 }, (_, i) => `${i}`).join("\n");
            const wrapper = mount(Tabular, {
                props: { content: `value\n${rows}`, maxRows: 5 },
            });
            const bodyRows = wrapper.findAll("tbody tr");
            expect(bodyRows.length).toBe(5);
        });
    });

    describe("Row numbering", () => {
        it("displays row numbers starting at 1", () => {
            const wrapper = mount(Tabular, {
                props: { content: "a\n1\n2\n3" },
            });
            const firstRowNumber = wrapper.find("tbody tr td");
            expect(firstRowNumber.text()).toBe("1");
        });
    });
});
