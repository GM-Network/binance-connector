"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Returns a Promise that resolves to the value of window.ethereum if it is
 * set within the given timeout, or null.
 * The Promise will not reject, but an error will be thrown if invalid options
 * are provided.
 *
 * @param options - Options bag.
 * @param options.mustBeBinance - Whether to only look for Binance providers.
 * Default: false
 * @param options.silent - Whether to silence console errors. Does not affect
 * thrown errors. Default: false
 * @param options.timeout - Milliseconds to wait for 'ethereum#initialized' to
 * be dispatched. Default: 3000
 * @returns A Promise that resolves with the Provider if it is detected within
 * given timeout, otherwise null.
 */
function detectEthereumProvider({ mustBeBinance = true, silent = false, timeout = 3000, } = {}) {
    _validateInputs();
    let handled = false;
    return new Promise((resolve) => {
        if (window.ethereum) {
            handleEthereum();
        }
        else {
            window.addEventListener("ethereum#initialized", handleEthereum, {
                once: true,
            });
            setTimeout(() => {
                handleEthereum();
            }, timeout);
        }
        function handleEthereum() {
            if (handled) {
                return;
            }
            handled = true;
            window.removeEventListener("ethereum#initialized", handleEthereum);
            const { ethereum } = window;
            if (ethereum && (!mustBeBinance || ethereum.isBinance)) {
                resolve(ethereum);
            }
            else {
                const message = mustBeBinance && ethereum
                    ? "Non-Binance window.ethereum detected."
                    : "Unable to detect window.ethereum.";
                !silent && console.error("Binance detect-provider:", message);
                resolve(null);
            }
        }
    });
    function _validateInputs() {
        if (typeof mustBeBinance !== "boolean") {
            throw new Error(`Expected option 'mustBeBinance' to be a boolean.`);
        }
        if (typeof silent !== "boolean") {
            throw new Error(`Expected option 'silent' to be a boolean.`);
        }
        if (typeof timeout !== "number") {
            throw new Error(`Expected option 'timeout' to be a number.`);
        }
    }
}
exports.default = detectEthereumProvider;
