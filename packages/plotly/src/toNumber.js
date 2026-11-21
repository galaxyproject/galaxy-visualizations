export function toNumber(value) {
    return value === null || value === undefined || value === "" ? NaN : Number(value);
}
