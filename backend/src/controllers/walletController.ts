import { Request, Response } from 'express';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

export const connectWallet = async (req: Request, res: Response) => {
  try {
    const { 
      id, 
      cardinal_pubkey, 
      cardinal_address, 
      ordinal_address, 
      ordinal_pubkey,
      wallet,
      network,
      signature,
      message,
      connected
    } = req.body;

    if (!id || !cardinal_pubkey || !cardinal_address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Update or create user with wallet details
    const user = await prisma.user.upsert({
      where: { id },
      update: {
        cardinal_pubkey,
        cardinal_address,
        ordinal_address,
        ordinal_pubkey,
        wallet,
        network,
        signature,
        message,
        connected: connected || true,
      },
      create: {
        id,
        cardinal_pubkey,
        cardinal_address,
        ordinal_address,
        ordinal_pubkey,
        wallet,
        network,
        signature,
        message,
        connected: connected || true,
      },
    });

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Error connecting wallet:', error);
    return res.status(500).json({ error: 'Failed to connect wallet' });
  }
};

export const disconnectWallet = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing user ID' });
    }

    // Update user to remove wallet details
    const user = await prisma.user.update({
      where: { id },
      data: {
        cardinal_pubkey: null,
        cardinal_address: null,
        ordinal_address: null,
        ordinal_pubkey: null,
        wallet: null,
        network: null,
        signature: null,
        message: null,
        connected: false,
      },
    });

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Error disconnecting wallet:', error);
    return res.status(500).json({ error: 'Failed to disconnect wallet' });
  }
};

export const getWalletDetails = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: 'Missing user ID' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        cardinal_pubkey: true,
        cardinal_address: true,
        ordinal_address: true,
        ordinal_pubkey: true,
        wallet: true,
        network: true,
        connected: true,
        signature: true,
        message: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      walletDetails: {
        cardinal_pubkey: user.cardinal_pubkey,
        cardinal_address: user.cardinal_address,
        ordinal_address: user.ordinal_address,
        ordinal_pubkey: user.ordinal_pubkey,
        wallet: user.wallet,
        network: user.network,
        connected: user.connected,
        signature: user.signature,
        message: user.message,
      },
    });
  } catch (error) {
    console.error('Error getting wallet details:', error);
    return res.status(500).json({ error: 'Failed to get wallet details' });
  }
};
