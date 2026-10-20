// Kopie van BrewMate/src/achievements/index.ts. Houd deze in sync met de app.
// Alleen de import van Ionicons-typen is weggehaald; de regels zijn exact hetzelfde.


export interface AchievementStats {
  totalBeers: number;
  totalDays: number;
  totalVolumeCl: number;
  currentStreak: number;
  longestStreak: number;
  createdAt: Date | null;
  isPremium: boolean;
  lastBeerTime: Date | null;
  friendCount: number;
  profileShareCount: number;
  hasProfilePicture: boolean;
  hasProfileBanner: boolean;
  birthDate: Date | null;
  previousStreak: number;
  daysSinceLastBeer: number;
  loggedSizes: number[];
  unlockedAchievementCount: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (stats: AchievementStats) => boolean;
}

// Add new achievements here — no other file needs to change.
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'early_adopter',
    title: 'Early Adopter',
    description: 'Joined BrewMate before 2026',
    icon: 'rocket-outline',
    check: ({ createdAt }) => !!createdAt && createdAt < new Date('2026-01-01'),
  },
  {
    id: 'first_beer',
    title: 'First Sip',
    description: 'Log your first beer',
    icon: 'beer-outline',
    check: ({ totalBeers }) => totalBeers >= 1,
  },
  {
    id: 'five_beers',
    title: 'High Five',
    description: 'Log 5 beers total',
    icon: 'hand-left-outline',
    check: ({ totalBeers }) => totalBeers >= 5,
  },
  {
    id: 'ten_beers',
    title: 'Perfect Ten',
    description: 'Log 10 beers total',
    icon: 'trophy-outline',
    check: ({ totalBeers }) => totalBeers >= 10,
  },
  {
    id: 'twenty_five_beers',
    title: 'Quarter Century',
    description: 'Log 25 beers total',
    icon: 'medal-outline',
    check: ({ totalBeers }) => totalBeers >= 25,
  },
  {
    id: 'fifty_beers',
    title: 'Half Century',
    description: 'Log 50 beers total',
    icon: 'ribbon-outline',
    check: ({ totalBeers }) => totalBeers >= 50,
  },
  {
    id: 'hundred_beers',
    title: 'Centurion',
    description: 'Log 100 beers total',
    icon: 'star-outline',
    check: ({ totalBeers }) => totalBeers >= 100,
  },
  {
    id: 'streak_3',
    title: 'Hat Trick',
    description: 'Log a beer 3 days in a row',
    icon: 'flame-outline',
    check: ({ longestStreak }) => longestStreak >= 3,
  },
  {
    id: 'streak_7',
    title: 'Week Warrior',
    description: 'Log a beer every day for a week',
    icon: 'calendar-outline',
    check: ({ longestStreak }) => longestStreak >= 7,
  },
  {
    id: 'seven_days',
    title: 'Regular',
    description: 'Log beers on 7 different days',
    icon: 'checkmark-circle-outline',
    check: ({ totalDays }) => totalDays >= 7,
  },
  {
    id: 'five_liters',
    title: 'Five Liter Club',
    description: 'Log a total of 5 liters',
    icon: 'water-outline',
    check: ({ totalVolumeCl }) => totalVolumeCl >= 500,
  },
  {
    id: 'ten_liters',
    title: 'Ten Liter Club',
    description: 'Log a total of 10 liters',
    icon: 'wine-outline',
    check: ({ totalVolumeCl }) => totalVolumeCl >= 1000,
  },
  {
    id: 'supporter',
    title: 'Supporter',
    description: 'Support BrewMate with a Premium subscription',
    icon: 'heart',
    check: ({ isPremium }) => isPremium,
  },

  // Time-based
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Log a beer before noon',
    icon: 'sunny-outline',
    check: ({ lastBeerTime }) => !!lastBeerTime && lastBeerTime.getHours() < 12,
  },
  {
    id: 'liquid_lunch',
    title: 'Liquid Lunch',
    description: 'Log a beer between 12:00 and 14:00',
    icon: 'restaurant-outline',
    check: ({ lastBeerTime }) => {
      if (!lastBeerTime) return false;
      const h = lastBeerTime.getHours();
      return h >= 12 && h < 14;
    },
  },
  {
    id: 'happy_hour',
    title: 'Happy Hour',
    description: 'Log a beer between 17:00 and 19:00',
    icon: 'happy-outline',
    check: ({ lastBeerTime }) => {
      if (!lastBeerTime) return false;
      const h = lastBeerTime.getHours();
      return h >= 17 && h < 19;
    },
  },
  {
    id: 'night_owl',
    title: 'Night Owl',
    description: 'Log a beer after midnight',
    icon: 'moon-outline',
    check: ({ lastBeerTime }) => !!lastBeerTime && lastBeerTime.getHours() === 0,
  },
  {
    id: 'last_call',
    title: 'Last Call',
    description: 'Log a beer between 23:00 and midnight',
    icon: 'alarm-outline',
    check: ({ lastBeerTime }) => !!lastBeerTime && lastBeerTime.getHours() === 23,
  },
  {
    id: 'sunday_session',
    title: 'Sunday Session',
    description: 'Log a beer on a Sunday',
    icon: 'bed-outline',
    check: ({ lastBeerTime }) => !!lastBeerTime && lastBeerTime.getDay() === 0,
  },
  {
    id: 'friday_feeling',
    title: 'Friday Feeling',
    description: 'Log a beer on a Friday',
    icon: 'musical-notes-outline',
    check: ({ lastBeerTime }) => !!lastBeerTime && lastBeerTime.getDay() === 5,
  },
  {
    id: 'monday_blues',
    title: 'Monday Blues',
    description: 'Log a beer on a Monday',
    icon: 'sad-outline',
    check: ({ lastBeerTime }) => !!lastBeerTime && lastBeerTime.getDay() === 1,
  },
  {
    id: 'new_years_eve',
    title: 'Auld Lang Syne',
    description: "Log a beer on New Year's Eve",
    icon: 'sparkles-outline',
    check: ({ lastBeerTime }) => {
      if (!lastBeerTime) return false;
      return lastBeerTime.getMonth() === 11 && lastBeerTime.getDate() === 31;
    },
  },
  {
    id: 'new_years_day',
    title: 'Hair of the Dog',
    description: "Log a beer on New Year's Day",
    icon: 'bandage-outline',
    check: ({ lastBeerTime }) => {
      if (!lastBeerTime) return false;
      return lastBeerTime.getMonth() === 0 && lastBeerTime.getDate() === 1;
    },
  },
  {
    id: 'birthday_beer',
    title: 'Birthday Beer',
    description: 'Log a beer on your birthday',
    icon: 'gift-outline',
    check: ({ lastBeerTime, birthDate }) => {
      if (!lastBeerTime || !birthDate) return false;
      return (
        lastBeerTime.getMonth() === birthDate.getMonth() &&
        lastBeerTime.getDate() === birthDate.getDate()
      );
    },
  },
  {
    id: 'kings_day',
    title: 'Oranje Boven',
    description: "Log a beer on King's Day (April 27th)",
    icon: 'flag-outline',
    check: ({ lastBeerTime }) => {
      if (!lastBeerTime) return false;
      return lastBeerTime.getMonth() === 3 && lastBeerTime.getDate() === 27;
    },
  },

  // Social
  {
    id: 'first_friend',
    title: 'Cheers!',
    description: 'Add your first friend',
    icon: 'person-add-outline',
    check: ({ friendCount }) => friendCount >= 1,
  },
  {
    id: 'five_friends',
    title: 'Round Buyer',
    description: 'Add 5 friends',
    icon: 'people-outline',
    check: ({ friendCount }) => friendCount >= 5,
  },
  {
    id: 'ten_friends',
    title: 'Life of the Party',
    description: 'Add 10 friends',
    icon: 'people-circle-outline',
    check: ({ friendCount }) => friendCount >= 10,
  },
  {
    id: 'twenty_five_friends',
    title: 'Mayor of the Bar',
    description: 'Add 25 friends',
    icon: 'business-outline',
    check: ({ friendCount }) => friendCount >= 25,
  },
  {
    id: 'share_profile',
    title: 'Spread the Word',
    description: 'Share your profile',
    icon: 'share-social-outline',
    check: ({ profileShareCount }) => profileShareCount >= 1,
  },
  {
    id: 'share_five',
    title: 'Influencer',
    description: 'Share your profile 5 times',
    icon: 'megaphone-outline',
    check: ({ profileShareCount }) => profileShareCount >= 5,
  },
  {
    id: 'friend_streak',
    title: 'Drinking Buddies',
    description: 'Log on the same day as a friend',
    icon: 'beer-outline',
    check: ({ friendCount }) => friendCount >= 1,
  },

  // Profile
  {
    id: 'profile_picture',
    title: 'Face of the Bar',
    description: 'Upload a profile picture',
    icon: 'camera-outline',
    check: ({ hasProfilePicture }) => hasProfilePicture,
  },
  {
    id: 'profile_banner',
    title: 'Roll out the Red Carpet',
    description: 'Set a profile banner',
    icon: 'image-outline',
    check: ({ hasProfileBanner }) => hasProfileBanner,
  },
  {
    id: 'full_profile',
    title: 'The Full Package',
    description: 'Set both a profile picture and banner',
    icon: 'id-card-outline',
    check: ({ hasProfilePicture, hasProfileBanner }) => hasProfilePicture && hasProfileBanner,
  },

  // Volume & counts
  {
    id: 'two_fifty_beers',
    title: '250 Club',
    description: 'Log 250 beers total',
    icon: 'podium-outline',
    check: ({ totalBeers }) => totalBeers >= 250,
  },
  {
    id: 'five_hundred_beers',
    title: 'Legend',
    description: 'Log 500 beers total',
    icon: 'skull-outline',
    check: ({ totalBeers }) => totalBeers >= 500,
  },
  {
    id: 'twenty_five_liters',
    title: 'Keg Slayer',
    description: 'Log 25 liters total',
    icon: 'beaker-outline',
    check: ({ totalVolumeCl }) => totalVolumeCl >= 2500,
  },
  {
    id: 'fifty_liters',
    title: 'The Brewery',
    description: 'Log 50 liters total',
    icon: 'flask-outline',
    check: ({ totalVolumeCl }) => totalVolumeCl >= 5000,
  },
  {
    id: 'hundred_liters',
    title: 'Industrial Scale',
    description: 'Log 100 liters total',
    icon: 'nuclear-outline',
    check: ({ totalVolumeCl }) => totalVolumeCl >= 10000,
  },
  {
    id: 'big_one',
    title: 'Go Big or Go Home',
    description: 'Log a beer of 1 liter',
    icon: 'resize-outline',
    check: ({ loggedSizes }) => loggedSizes.includes(100),
  },
  {
    id: 'small_one',
    title: 'Dainty Sipper',
    description: 'Log a beer of 15cl',
    icon: 'contract-outline',
    check: ({ loggedSizes }) => loggedSizes.includes(15),
  },
  {
    id: 'five_in_one_day',
    title: 'Session King',
    description: 'Log 5 beers in one day',
    icon: 'speedometer-outline',
    check: ({ totalBeers }) => totalBeers >= 5,
  },
  {
    id: 'ten_in_one_day',
    title: 'No Tomorrow',
    description: 'Log 10 beers in one day',
    icon: 'warning-outline',
    check: ({ totalBeers }) => totalBeers >= 10,
  },

  // Streaks
  {
    id: 'streak_14',
    title: 'Two Week Terror',
    description: 'Log a beer every day for 14 days',
    icon: 'trending-up-outline',
    check: ({ longestStreak }) => longestStreak >= 14,
  },
  {
    id: 'streak_30',
    title: 'Monthly Ritual',
    description: 'Log a beer every day for 30 days',
    icon: 'infinite-outline',
    check: ({ longestStreak }) => longestStreak >= 30,
  },
  {
    id: 'streak_100',
    title: 'Unstoppable',
    description: 'Log a beer every day for 100 days',
    icon: 'flash-outline',
    check: ({ longestStreak }) => longestStreak >= 100,
  },
  {
    id: 'streak_comeback',
    title: 'Like a Phoenix',
    description: 'Restart a streak after breaking one',
    icon: 'refresh-outline',
    check: ({ previousStreak, currentStreak }) => previousStreak >= 3 && currentStreak >= 1,
  },
  {
    id: 'streak_broken',
    title: 'The Morning After',
    description: 'Break a streak of 3 or more days',
    icon: 'heart-dislike-outline',
    check: ({ previousStreak, currentStreak }) => previousStreak >= 3 && currentStreak === 0,
  },

  // Days & sessions
  {
    id: 'thirty_days',
    title: 'Pub Regular',
    description: 'Log beers on 30 different days',
    icon: 'calendar-number-outline',
    check: ({ totalDays }) => totalDays >= 30,
  },
  {
    id: 'hundred_days',
    title: 'Century Club',
    description: 'Log beers on 100 different days',
    icon: 'stats-chart-outline',
    check: ({ totalDays }) => totalDays >= 100,
  },
  {
    id: 'weekend_warrior',
    title: 'Weekend Warrior',
    description: 'Log beers on both days of a weekend',
    icon: 'shield-outline',
    check: ({ isPremium }) => isPremium,
  },
  {
    id: 'long_weekend',
    title: 'Bank Holiday Hero',
    description: 'Log beers 3 days in a row over a weekend',
    icon: 'flag-outline',
    check: ({ longestStreak }) => longestStreak >= 3,
  },

  // Meta / app usage
  {
    id: 'app_anniversary',
    title: 'One Year In',
    description: 'Use BrewMate for over a year',
    icon: 'calendar-outline',
    check: ({ createdAt }) => {
      if (!createdAt) return false;
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      return Date.now() - createdAt.getTime() >= oneYearMs;
    },
  },
  {
    id: 'all_sizes',
    title: "Size Doesn't Matter",
    description: 'Log a beer in every available size (15, 25, 33, 40, 50, 100cl)',
    icon: 'options-outline',
    check: ({ loggedSizes }) =>
      [15, 25, 33, 40, 50, 100].every((s) => loggedSizes.includes(s)),
  },
  {
    id: 'achievement_hunter',
    title: 'Overachiever',
    description: 'Unlock 10 achievements',
    icon: 'ribbon-outline',
    check: ({ unlockedAchievementCount }) => unlockedAchievementCount >= 10,
  },
  {
    id: 'completionist',
    title: 'The Full Pint',
    description: 'Unlock 30 achievements',
    icon: 'trophy-outline',
    check: ({ unlockedAchievementCount }) => unlockedAchievementCount >= 30,
  },
  {
    id: 'comeback_kid',
    title: 'We Missed You',
    description: 'Log a beer after 30+ days of inactivity',
    icon: 'walk-outline',
    check: ({ daysSinceLastBeer, totalBeers }) =>
      totalBeers >= 2 && daysSinceLastBeer >= 30,
  },
];
