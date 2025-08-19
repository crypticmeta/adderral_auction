export interface Guest {
  id: string;
  btcAddress?: string;
  taprootAddress?: string;
  createdAt: Date;
}

// In-memory storage for guests (replace with a database in production)
export const guests: Map<string, Guest> = new Map();

export const findGuestById = (id: string): Guest | undefined => {
  return guests.get(id);
};

export const createGuest = (id: string): Guest => {
  const newGuest: Guest = {
    id,
    createdAt: new Date()
  };
  guests.set(id, newGuest);
  return newGuest;
};

export const updateGuestWallet = (guestId: string, btcAddress: string, taprootAddress: string): Guest | undefined => {
  const guest = guests.get(guestId);
  if (!guest) return undefined;
  
  const updatedGuest: Guest = {
    ...guest,
    btcAddress,
    taprootAddress
  };
  
  guests.set(guestId, updatedGuest);
  return updatedGuest;
};
