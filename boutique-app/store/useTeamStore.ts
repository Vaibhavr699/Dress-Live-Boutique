import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type TeamMemberImageKey = 'avatar' | 'catalog';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'Online' | 'Offline';
  languages: string;
  availabilityOn: boolean;
  imageKey: TeamMemberImageKey;
}

type TeamMemberInput = {
  name: string;
  role: string;
  email: string;
  languages: string;
  availabilityOn: boolean;
};

interface TeamState {
  members: TeamMember[];
  addMember: (member: TeamMemberInput) => string;
  updateMember: (id: string, updates: TeamMemberInput) => void;
  deleteMember: (id: string) => void;
}

const storage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(name);
    }
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(name, value);
      return;
    }
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(name);
      return;
    }
    await SecureStore.deleteItemAsync(name);
  },
};

const INITIAL_MEMBERS: TeamMember[] = [
  {
    id: '1',
    name: 'Elife',
    role: 'Sale Executive',
    email: 'example@gmail.com',
    status: 'Offline',
    languages: 'English, French',
    availabilityOn: true,
    imageKey: 'avatar',
  },
  {
    id: '2',
    name: 'Amina',
    role: 'Sale Executive',
    email: 'amina@example.com',
    status: 'Offline',
    languages: 'English, German',
    availabilityOn: false,
    imageKey: 'catalog',
  },
];

export const TEAM_MEMBER_IMAGES: Record<TeamMemberImageKey, any> = {
  avatar: require('../assets/images/avatar.png'),
  catalog: require('../assets/images/Dashboard image 2.png'),
};

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      members: INITIAL_MEMBERS,
      addMember: (member) => {
        const newId = String(Date.now());
        set({
          members: [
            {
              id: newId,
              status: member.availabilityOn ? 'Online' : 'Offline',
              imageKey: 'avatar',
              ...member,
            },
            ...get().members,
          ],
        });
        return newId;
      },
      updateMember: (id, updates) => {
        set({
          members: get().members.map((member) =>
            member.id === id
              ? {
                  ...member,
                  ...updates,
                  status: updates.availabilityOn ? 'Online' : 'Offline',
                }
              : member
          ),
        });
      },
      deleteMember: (id) => {
        set({ members: get().members.filter((member) => member.id !== id) });
      },
    }),
    {
      name: 'boutique-team-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);
