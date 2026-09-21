/** Session token usage, accumulated across turns as Orbit does. */

export interface TurnUsage {
    input?: number;
    output?: number;
    cost?: number | null;
}

export interface UsageBar {
    add(turn: TurnUsage | undefined): void;
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return String(n);
}

export function mountUsageBar(container: HTMLElement): UsageBar {
    const bar = container.querySelector<HTMLElement>("#usage-bar")!;
    const tokensEl = container.querySelector<HTMLElement>("#usage-tokens")!;
    const costEl = container.querySelector<HTMLElement>("#usage-cost")!;
    const session = { input: 0, output: 0, cost: null as number | null };

    const render = () => {
        const total = session.input + session.output;
        if (!total) {
            bar.classList.add("hidden");
            return;
        }
        bar.classList.remove("hidden");
        tokensEl.textContent = `${formatTokens(total)} tok`;
        tokensEl.title =
            `Session usage:\n  input: ${session.input.toLocaleString()}` +
            `\n  output: ${session.output.toLocaleString()}`;
        // Shown only when the provider priced the call; olite keeps no price table.
        if (session.cost === null) {
            costEl.textContent = "";
            costEl.classList.add("hidden");
            return;
        }
        costEl.textContent = session.cost < 0.01 ? "<$0.01" : `$${session.cost.toFixed(2)}`;
        costEl.title = `Session cost: $${session.cost.toFixed(4)} (reported by the provider)`;
        costEl.classList.remove("hidden");
    };

    return {
        add(turn) {
            if (!turn) {
                return;
            }
            session.input += turn.input || 0;
            session.output += turn.output || 0;
            if (turn.cost != null) {
                session.cost = (session.cost || 0) + turn.cost;
            }
            render();
        },
    };
}
