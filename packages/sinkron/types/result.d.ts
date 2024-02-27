export type ResultType<T, E = Error> = {
    isOk: true;
    value: T;
} | {
    isOk: false;
    error: E;
};
declare const Result: {
    ok: <T, E>(value: T) => ResultType<T, E>;
    err: <T_1, E_1>(error: E_1) => ResultType<T_1, E_1>;
};
export { Result };
