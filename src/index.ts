import {
  Actions,
  AddEthereumChainParameter,
  ProviderConnectInfo,
  ProviderRpcError,
  RequestArguments,
  WatchAssetParameters,
} from "@web3-react/types";
import { Connector } from "@web3-react/types";
import detectEthereumProvider from "./detect-provider";

export type BinanceWalletProvider = {
  isBinance?: boolean;
  request(args: RequestArguments): Promise<any>;
  on: (event: string, args: any) => any;
  removeListener: (event: string, args: any) => any;
  disconnect?(): void;
  enable?: () => Promise<string[]>;
  // window.ethereum
  providers?: Omit<BinanceWalletProvider, "providers">[];
  isConnected?: () => boolean;
  // qrcode isBinanceConnector=true
  chainId: string;
  connected?: boolean;
  accounts?: string[];
  connector?: any;
};

class NoBinanceError extends Error {
  public constructor() {
    super("Binance not installed");
    this.name = NoBinanceError.name;
    Object.setPrototypeOf(this, NoBinanceError.prototype);
  }
}

function parseChainId(chainId: string) {
  return Number.parseInt(chainId, 16);
}

/**
 * @param options - Options to pass to `binance/detect-provider`
 * @param onError - Handler to report errors thrown from eventListeners.
 */
interface BinanceWalletConstructorArgs {
  actions: Actions;
  supportedChainIds: number[];
  options?: Parameters<typeof detectEthereumProvider>[0];
  onError?: () => void;
}

export class BinanceWallet extends Connector {
  /** {@inheritdoc Connector.provider} */
  declare provider?: BinanceWalletProvider;

  private readonly options?: Parameters<typeof detectEthereumProvider>[0];
  private readonly supportedChainIds: number[];
  private isBinanceConnector: boolean = false;
  private eagerConnection?: Promise<boolean>;

  private get connected() {
    return !!this.provider?.connected || !!this.provider?.isConnected?.();
  }

  constructor({
    actions,
    options,
    onError,
    supportedChainIds,
  }: BinanceWalletConstructorArgs) {
    super(actions, onError);
    this.options = options;
    this.supportedChainIds = supportedChainIds;

    this.handleConnect = this.handleConnect.bind(this);
    this.handleChainChanged = this.handleChainChanged.bind(this);
    this.handleAccountsChanged = this.handleAccountsChanged.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
  }

  private handleConnect({ chainId }: ProviderConnectInfo) {
    this.actions.update({ chainId: parseChainId(chainId) });
  }
  private handleChainChanged(chainId: string) {
    if (!!chainId) {
      this.actions.update({ chainId: parseChainId(chainId) });
    }
  }
  private handleAccountsChanged(accounts: string[]) {
    if (accounts.length === 0) {
      // handle this edge case by disconnecting
      this.actions.resetState();
    } else {
      this.actions.update({ accounts });
    }
  }
  private handleDisconnect(error: ProviderRpcError) {
    if (this.isBinanceConnector) {
      this.provider?.removeListener("chainChanged", this.handleChainChanged);
      this.provider?.removeListener(
        "accountsChanged",
        this.handleAccountsChanged
      );
      this.provider = undefined;
      this.eagerConnection = undefined;
    }
    this.actions.resetState();
    this.onError?.(error);
  }

  private async isomorphicInitialize(): Promise<void> {
    if (this.eagerConnection) return;

    const provider = await detectEthereumProvider(this.options);
    if (provider) {
      this.provider = provider as unknown as BinanceWalletProvider;

      // handle the case when e.g. Binance and coinbase wallet are both installed
      if (this.provider.providers?.length) {
        this.provider =
          this.provider.providers.find((p) => p.isBinance) ??
          this.provider.providers[0];
      }

      this.provider.on("connect", this.handleConnect);
      this.provider.on("disconnect", this.handleDisconnect);
      this.provider.on("close", this.handleDisconnect);
      this.provider.on("chainChanged", this.handleChainChanged);
      this.provider.on("accountsChanged", this.handleAccountsChanged);
    } else {
      if (!this.provider) {
        const m = await import("@binance/w3w-ethereum-provider");
        const BinanceEthereumProvider = m.default;

        this.provider = new BinanceEthereumProvider({
          showQrCodeModal: true,
          lng: "en",
        });
        this.provider.isBinance = true;
        this.isBinanceConnector = true;
      }

      // Workaround to bubble up the error when user reject the connection
      // @ts-ignore
      this.provider.connector.on("disconnect", () => {
        // Check provider has not been enabled to prevent this event callback from being called in the future
        if (!this.provider?.accounts?.length) {
          console.debug("connector disconnect");
          // userReject: Erase the provider manually
          this.provider = undefined;
          this.eagerConnection = undefined;
        }
      });

      this.provider?.on("connect", this.handleConnect);
      this.provider?.on("disconnect", this.handleDisconnect);
      this.provider?.on("close", this.handleDisconnect);
      this.provider?.on("chainChanged", this.handleChainChanged);
      this.provider?.on("accountsChanged", this.handleAccountsChanged);
    }

    this.eagerConnection = Promise.resolve(true);
    // return (this.eagerConnection = import("./detect-provider").then(
    //   async (m) => {
    //      const provider = await m.default(this.options);
    //   }
    // ));
  }

  /** {@inheritdoc Connector.connectEagerly} */
  public async connectEagerly(): Promise<void> {
    const cancelActivation = this.actions.startActivation();

    try {
      await this.isomorphicInitialize();
      if (!this.provider) return cancelActivation();

      // Wallets may resolve eth_chainId and hang on eth_accounts pending user interaction, which may include changing
      // chains; they should be requested serially, with accounts first, so that the chainId can settle.
      const accounts = (await this.provider.request({
        method: "eth_accounts",
      })) as string[];
      if (!accounts.length) {
        // throw new Error("No accounts returned");
        console.debug("Could not connect eagerly", "No accounts returned");
        this.actions.resetState();
        return;
      }

      const chainId = (await this.provider.request({
        method: "eth_chainId",
      })) as string;
      this.actions.update({ chainId: parseChainId(chainId), accounts });
    } catch (error) {
      console.debug("Could not connect eagerly", error);
      // we should be able to use `cancelActivation` here, but on mobile, Binance emits a 'connect'
      // event, meaning that chainId is updated, and cancelActivation doesn't work because an intermediary
      // update has occurred, so we reset state instead
      this.actions.resetState();
    }
  }

  /**
   * Initiates a connection.
   *
   * @param desiredChainIdOrChainParameters - If defined, indicates the desired chain to connect to. If the user is
   * already connected to this chain, no additional steps will be taken. Otherwise, the user will be prompted to switch
   * to the chain, if one of two conditions is met: either they already have it added in their extension, or the
   * argument is of type AddEthereumChainParameter, in which case the user will be prompted to add the chain with the
   * specified parameters first, before being prompted to switch.
   */
  public async activate(
    desiredChainIdOrChainParameters?: number | AddEthereumChainParameter
  ): Promise<void> {
    let cancelActivation: () => void;

    if (!this.connected) cancelActivation = this.actions.startActivation();

    this.isomorphicInitialize()
      .then(async () => {
        if (!this.provider) {
          const link = "https://www.binance.com/en/download";
          window.open(link, "_blank");

          return new NoBinanceError();
          // throw new NoBinanceError();
        }

        try {
          // if enable is successful but doesn't return accounts,
          // fall back to getAccount (not happy i have to do this...)
          // @ts-ignore
          await this.provider?.enable();
        } catch (error: any) {
          if (error.code === 100001) {
            console.error("enable error ", error);
            // userReject: Erase the provider manually
            this.provider = undefined;
            this.eagerConnection = undefined;
            return;
          }
        }

        // Wallets may resolve eth_chainId and hang on eth_accounts pending user interaction, which may include changing
        // chains; they should be requested serially, with accounts first, so that the chainId can settle.
        const accounts = (await this.provider!.request({
          method: "eth_requestAccounts",
        })) as string[];
        const chainId = (await this.provider!.request({
          method: "eth_chainId",
        })) as string;
        const receivedChainId = parseChainId(chainId);
        const desiredChainId =
          typeof desiredChainIdOrChainParameters === "number"
            ? desiredChainIdOrChainParameters
            : desiredChainIdOrChainParameters?.chainId;

        // if there's no desired chain, or it's equal to the received, update
        if (!desiredChainId || receivedChainId === desiredChainId) {
          return this.actions.update({ chainId: receivedChainId, accounts });
        }

        if (!this.supportedChainIds.includes(desiredChainId)) {
          return this.actions.update({ chainId: receivedChainId, accounts });
        }

        const desiredChainIdHex = `0x${desiredChainId.toString(16)}`;

        // if we're here, we can try to switch networks
        return this.provider!.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: desiredChainIdHex }],
        })
          .catch((error: ProviderRpcError) => {
            console.error("provider error", error, desiredChainId);

            // https://github.com/MetaMask/metamask-mobile/issues/3312#issuecomment-1065923294
            const errorCode =
              (error.data as any)?.originalError?.code || error.code;

            // 4902 indicates that the chain has not been added to Binance and wallet_addEthereumChain needs to be called
            // https://docs.metamask.io/guide/rpc-api.html#wallet-switchethereumchain
            if (
              errorCode === 4902 &&
              typeof desiredChainIdOrChainParameters !== "number"
            ) {
              if (!this.provider) throw new Error("No provider");
              // if we're here, we can try to add a new network
              return this.provider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    ...desiredChainIdOrChainParameters,
                    chainId: desiredChainIdHex,
                  },
                ],
              });
            }

            throw error;
          })
          .then(() => this.activate(desiredChainId));
      })
      .catch((error) => {
        cancelActivation?.();
        throw error;
      });
  }

  public async deactivate(): Promise<void> {
    this.provider?.removeListener("chainChanged", this.handleChainChanged);
    this.provider?.removeListener(
      "accountsChanged",
      this.handleAccountsChanged
    );
    this.provider?.removeListener("close", this.handleDisconnect);

    if (this.isBinanceConnector) {
      this.provider?.removeListener("connect", this.handleConnect);
      this.provider?.removeListener("disconnect", this.handleDisconnect);
      this.provider?.disconnect?.();
      // activate is triggered automatically
      this.provider = undefined;
      this.eagerConnection = undefined;
    }

    // if (super.deactivate != null) {
    //   void super.deactivate();
    // } else {
    //   void super.resetState();
    // }
  }

  public async watchAsset({
    address,
    symbol,
    decimals,
    image,
  }: WatchAssetParameters): Promise<true> {
    if (!this.provider) throw new Error("No provider");

    return this.provider
      .request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20", // Initially only supports ERC20, but eventually more!
          options: {
            address, // The address that the token is at.
            symbol, // A ticker symbol or shorthand, up to 5 chars.
            decimals, // The number of decimals in the token
            image, // A string url of the token logo
          },
        },
      })
      .then((success) => {
        if (!success) throw new Error("Rejected");
        return true;
      });
  }
}
export default BinanceWallet;
