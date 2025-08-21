/**
 * Bitcoin Price Service
 * Fetches and caches Bitcoin price from multiple sources
 */

import axios from 'axios';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

export class BitcoinPriceService {
  private static instance: BitcoinPriceService;
  private readonly CACHE_KEY = 'btc:price:usd';
  private readonly CACHE_EXPIRY = 30 * 60; // 30 minutes in seconds
  // Long-term cache used when live fetching fails
  private readonly LONG_CACHE_KEY = 'btc:price:usd:long';
  private readonly LONG_CACHE_EXPIRY = 3 * 24 * 60 * 60; // 3 days in seconds
  private readonly PRICE_SOURCES = [    
    {
      name: 'Binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      parser: (data: any) => parseFloat(data?.price)
    },
    {
      name: 'Bitfinex',
      url: 'https://api-pub.bitfinex.com/v2/ticker/tBTCUSD',
      parser: (data: any) => data?.[6] // Last price is at index 6
    },
    {
      name: 'Huobi',
      url: 'https://api.huobi.pro/market/detail/merged?symbol=btcusdt',
      parser: (data: any) => parseFloat(data?.tick?.close)
    },
  ];
  
  private constructor() {}

  public static getInstance(): BitcoinPriceService {
    if (!BitcoinPriceService.instance) {
      BitcoinPriceService.instance = new BitcoinPriceService();
    }
    return BitcoinPriceService.instance;
  }

  /**
   * Get current Bitcoin price in USD
   * Returns cached price if available, otherwise fetches from APIs
   */
  public async getBitcoinPrice(): Promise<number> {
    // Try to get from cache first
    const cachedPrice = await redisClient.get(this.CACHE_KEY);
    if (cachedPrice) {
      const v = parseFloat(cachedPrice);
      if (!isNaN(v) && v > 0) return v;
    }

    // If not in cache, fetch from sources
    const price = await this.fetchPriceFromSources();

    // Cache the result
    if (price > 0) {
      await redisClient.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_EXPIRY);
      await redisClient.set(this.LONG_CACHE_KEY, price.toString(), 'EX', this.LONG_CACHE_EXPIRY);
      return price;
    }

    // Fresh fetch failed. Try long-term cache before erroring.
    const longCached = await redisClient.get(this.LONG_CACHE_KEY);
    if (longCached) {
      const v = parseFloat(longCached);
      if (!isNaN(v) && v > 0) return v;
    }

    // Neither fresh nor long-term cache available
    throw new Error('Unable to obtain valid BTC price');
  }

  /**
   * Force refresh the Bitcoin price cache
   */
  public async refreshBitcoinPrice(): Promise<number> {
    const price = await this.fetchPriceFromSources();
    if (price > 0) {
      await redisClient.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_EXPIRY);
      await redisClient.set(this.LONG_CACHE_KEY, price.toString(), 'EX', this.LONG_CACHE_EXPIRY);
      return price;
    }
    throw new Error('Unable to refresh BTC price');
  }

  /**
   * Fetch Bitcoin price from multiple sources and calculate median
   */
  private async fetchPriceFromSources(): Promise<number> {
    const prices: number[] = [];

    // Fetch from all sources in parallel
    const pricePromises = this.PRICE_SOURCES.map(async (source) => {
      try {
        const response = await axios.get(source.url, { timeout: 5000 });
        const price = source.parser(response.data);

        if (price && !isNaN(price) && price > 0) {
          logger.info(`Got BTC price from ${source.name}: $${price}`);
          prices.push(price);
          return price;
        }
      } catch (error) {
        logger.error(`Error fetching from ${source.name}:`, error);
        return null as any;
      }
    });

    // Wait for all price fetches to complete
    await Promise.all(pricePromises);

    if (prices.length === 0) {
      logger.warn('No valid prices received from any source');
      return 0; // Signal failure to caller
    }

    // Sort prices and get median (or average of middle two if even number)
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);

    if (prices.length % 2 === 0) {
      return (prices[mid - 1] + prices[mid]) / 2;
    } else {
      return prices[mid];
    }
  }
}

// Export a singleton instance
export const bitcoinPriceService = BitcoinPriceService.getInstance();
