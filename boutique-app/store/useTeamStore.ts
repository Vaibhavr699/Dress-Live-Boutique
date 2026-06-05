import { create } from 'zustand';
import { api } from '@shared/api/api';

export type TeamMemberImageKey = 'avatar' | 'catalog';

export type TeamAvailabilityEntry = {
  day: string;
  value: string;
};

export const DEFAULT_TEAM_AVAILABILITY: TeamAvailabilityEntry[] = [
  { day: 'Monday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Tuesday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Wednesday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Thursday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Friday', value: 'Available: 11:00AM To 01:00PM' },
  { day: 'Saturday', value: 'Closed' },
  { day: 'Sunday', value: 'Closed' },
];

// Roles offered in the invite/edit dropdown. Kept here so the form and any
// future filter share one source of truth.
export const TEAM_ROLE_OPTIONS = ['Stylist', 'Consultant', 'Manager', 'Owner'];

export type TeamMemberStatus = 'pending' | 'active';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  // 'pending' = invited, not yet accepted. 'active' = accepted (has a login).
  status: TeamMemberStatus;
  languages: string[];
  availabilityOn: boolean;
  availabilitySchedule: TeamAvailabilityEntry[];
  imageKey: TeamMemberImageKey;
}

// Shape returned by the backend (snake_case). Mapped into TeamMember below.
type ApiTeamMember = {
  id: number;
  email: string;
  role: string;
  name: string | null;
  languages: string[] | null;
  availability_on: boolean;
  availability_schedule: TeamAvailabilityEntry[] | null;
  status: TeamMemberStatus;
};

function fromApi(m: ApiTeamMember): TeamMember {
  return {
    id: String(m.id),
    name: m.name ?? '',
    role: m.role,
    email: m.email,
    status: m.status,
    languages: m.languages ?? [],
    availabilitySchedule:
      m.availability_schedule && m.availability_schedule.length
        ? m.availability_schedule
        : DEFAULT_TEAM_AVAILABILITY,
    availabilityOn: !!m.availability_on,
    imageKey: 'avatar',
  };
}

type TeamMemberEdit = Partial<
  Pick<TeamMember, 'name' | 'role' | 'languages' | 'availabilityOn' | 'availabilitySchedule'>
>;

interface TeamState {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  fetchMembers: () => Promise<void>;
  // Partner invites an advisor by email + role → backend sends the email and
  // returns the new member in `pending` status.
  inviteMember: (input: { email: string; role: string }) => Promise<TeamMember>;
  updateMember: (id: string, updates: TeamMemberEdit) => Promise<void>;
  updateMemberAvailability: (
    id: string,
    availabilitySchedule: TeamAvailabilityEntry[]
  ) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
}

export const TEAM_MEMBER_IMAGES: Record<TeamMemberImageKey, any> = {
  avatar: require('../assets/images/avatar.png'),
  catalog: require('../assets/images/Dashboard image 2.png'),
};

export const useTeamStore = create<TeamState>()((set, get) => ({
  members: [],
  loading: false,
  error: null,

  fetchMembers: async () => {
    set({ loading: true, error: null });
    try {
      const data = (await api.get('/team')) as ApiTeamMember[];
      set({ members: data.map(fromApi), loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Could not load your team.' });
    }
  },

  inviteMember: async ({ email, role }) => {
    const created = (await api.post('/team', { email, role })) as ApiTeamMember;
    const member = fromApi(created);
    set({ members: [member, ...get().members.filter((m) => m.id !== member.id)] });
    return member;
  },

  updateMember: async (id, updates) => {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.role !== undefined) body.role = updates.role;
    if (updates.languages !== undefined) body.languages = updates.languages;
    if (updates.availabilityOn !== undefined) body.availability_on = updates.availabilityOn;
    if (updates.availabilitySchedule !== undefined)
      body.availability_schedule = updates.availabilitySchedule;
    const updated = (await api.put(`/team/${id}`, body)) as ApiTeamMember;
    const member = fromApi(updated);
    set({ members: get().members.map((m) => (m.id === id ? member : m)) });
  },

  updateMemberAvailability: async (id, availabilitySchedule) => {
    const availabilityOn = availabilitySchedule.some((entry) => entry.value !== 'Closed');
    // Optimistic so the details screen reflects the change immediately.
    set({
      members: get().members.map((m) =>
        m.id === id ? { ...m, availabilitySchedule, availabilityOn } : m
      ),
    });
    try {
      const updated = (await api.put(`/team/${id}`, {
        availability_schedule: availabilitySchedule,
        availability_on: availabilityOn,
      })) as ApiTeamMember;
      const member = fromApi(updated);
      set({ members: get().members.map((m) => (m.id === id ? member : m)) });
    } catch {
      // Re-sync from the server if the write failed.
      void get().fetchMembers();
    }
  },

  deleteMember: async (id) => {
    const prev = get().members;
    set({ members: prev.filter((m) => m.id !== id) });
    try {
      await api.delete(`/team/${id}`);
    } catch (e) {
      set({ members: prev });
      throw e;
    }
  },
}));
