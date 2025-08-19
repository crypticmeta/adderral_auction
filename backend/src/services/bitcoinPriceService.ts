/**
 * Bitcoin Price Service
 * Fetches and caches Bitcoin price from multiple sources
 */

import axios from 'axios';
import { redisClient } from '../config/redis';

export class BitcoinPriceService {
  private static instance: BitcoinPriceService;
  private readonly CACHE_KEY = 'btc:price:usd';
  private readonly CACHE_EXPIRY = 30 * 60; // 30 minutes in seconds
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
    try {
      // Try to get from cache first
      const cachedPrice = await redisClient.get(this.CACHE_KEY);
      if (cachedPrice) {
        return parseFloat(cachedPrice);
      }

      // If not in cache, fetch from sources
      const price = await this.fetchPriceFromSources();
      
      // Cache the result
      if (price > 0) {
        await redisClient.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_EXPIRY);
      }
      
      return price;
    } catch (error) {
      console.error('Error getting Bitcoin price:', error);
      return 60000; // Fallback price if all sources fail
    }
  }

  /**
   * Force refresh the Bitcoin price cache
   */
  public async refreshBitcoinPrice(): Promise<number> {
    try {
      const price = await this.fetchPriceFromSources();
      
      // Cache the result
      if (price > 0) {
        await redisClient.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_EXPIRY);
      }
      
      return price;
    } catch (error) {
      console.error('Error refreshing Bitcoin price:', error);
      return 0;
    }
  }

  /**
   * Fetch Bitcoin price from multiple sources and calculate median
   */
  private async fetchPriceFromSources(): Promise<number> {
    try {
      const prices: number[] = [];
      
      // Fetch from all sources in parallel
      const pricePromises = this.PRICE_SOURCES.map(async (source) => {
        try {
          const response = await axios.get(source.url, { timeout: 5000 });
          const price = source.parser(response.data);
          
          if (price && !isNaN(price) && price > 0) {
            console.log(`Got BTC price from ${source.name}: $${price}`);
            prices.push(price);
            return price;
          }
        } catch (error) {
          console.error(`Error fetching from ${source.name}:`, error);
          return null;
        }
      });
      
      // Wait for all price fetches to complete
      await Promise.all(pricePromises);
      
      if (prices.length === 0) {
        console.warn('No valid prices received from any source');
        return 60000; // Fallback price
      }
      
      // Sort prices and get median (or average of middle two if even number)
      prices.sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      
      if (prices.length % 2 === 0) {
        return (prices[mid - 1] + prices[mid]) / 2;
      } else {
        return prices[mid];
      }
    } catch (error) {
      console.error('Error fetching Bitcoin price:', error);
      return 60000; // Fallback price
    }
  }
}

// Export a singleton instance
export const bitcoinPriceService = BitcoinPriceService.getInstance();
