// ============================================================
// 데모 데이터 - API 키 없이 파이프라인 테스트용
// ============================================================

import type { RedditPost, FlixPatrolEntry, MyDramaListEntry } from './types/index.js'

export const demoRedditPosts: RedditPost[] = [
  {
    id: 'demo1', subreddit: 'kdramas',
    title: 'Just finished "When the Stars Gossip" and I am OBSESSED - anyone else?',
    url: 'https://reddit.com/r/kdramas/demo1', score: 2341, commentCount: 187,
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), flair: 'Discussion',
    comments: [
      { id: 'c1', body: 'The chemistry between the leads is absolutely insane. Best drama of 2025 so far!', score: 432, depth: 0 },
      { id: 'c2', body: 'Gong Hyo-jin is carrying this show. Her comedic timing is perfect.', score: 287, depth: 0 },
      { id: 'c3', body: 'If you like this, watch "My Mister" - similar vibes but more serious.', score: 198, depth: 1 },
    ]
  },
  {
    id: 'demo2', subreddit: 'kdramas',
    title: 'Recommend me something similar to "Squid Game" - intense, survival, thriller',
    url: 'https://reddit.com/r/kdramas/demo2', score: 1876, commentCount: 234,
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(), flair: 'Recommendations',
    comments: [
      { id: 'c4', body: '"Sweet Home" season 3 just dropped and its incredible', score: 521, depth: 0 },
      { id: 'c5', body: 'Try "Signal" or "Voice" - great thrillers', score: 312, depth: 0 },
      { id: 'c6', body: '"Juvenile Justice" on Netflix is underrated and intense', score: 201, depth: 0 },
    ]
  },
  {
    id: 'demo3', subreddit: 'kdrama',
    title: '"My Mister" rewatch - still the best Korean drama ever made, change my mind',
    url: 'https://reddit.com/r/kdrama/demo3', score: 3102, commentCount: 412,
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(), flair: 'Review',
    comments: [
      { id: 'c7', body: 'My Mister transcends the kdrama genre entirely. IU\'s performance is career-defining.', score: 876, depth: 0 },
      { id: 'c8', body: 'Agreed, I recommend this to everyone regardless of whether they watch kdramas', score: 543, depth: 0 },
    ]
  },
  {
    id: 'demo4', subreddit: 'kdramarecommends',
    title: 'Looking for dramas with strong female leads like "Crash Landing on You"',
    url: 'https://reddit.com/r/kdramarecommends/demo4', score: 987, commentCount: 156,
    createdAt: new Date(Date.now() - 12 * 3600000).toISOString(), flair: 'Request',
    comments: [
      { id: 'c9', body: '"It\'s Okay to Not Be Okay" - Seo Ye-ji is a powerhouse', score: 342, depth: 0 },
      { id: 'c10', body: 'Have you seen "Mr. Sunshine"? Incredible female lead and cinematography', score: 287, depth: 0 },
      { id: 'c11', body: '"Misaeng" for something completely different - workplace drama but so good', score: 198, depth: 1 },
    ]
  },
  {
    id: 'demo5', subreddit: 'kdramas',
    title: 'Squid Game Season 2 vs Season 1 - honest thoughts after full rewatch',
    url: 'https://reddit.com/r/kdramas/demo5', score: 4521, commentCount: 623,
    createdAt: new Date(Date.now() - 18 * 3600000).toISOString(), flair: 'Discussion',
    comments: [
      { id: 'c12', body: 'Season 1 is objectively better but S2 has its moments. The ending sets up S3 perfectly.', score: 1021, depth: 0 },
      { id: 'c13', body: 'Fight scene choreography improved massively in S2 though', score: 654, depth: 0 },
    ]
  },
  {
    id: 'demo6', subreddit: 'korean',
    title: 'Best way to learn Korean through dramas? Intermediate learner here',
    url: 'https://reddit.com/r/korean/demo6', score: 743, commentCount: 89,
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(), flair: 'Learning',
    comments: [
      { id: 'c14', body: 'Start with slice of life dramas - Reply 1988 is perfect for natural Korean', score: 321, depth: 0 },
      { id: 'c15', body: 'Use Language Reactor extension with Netflix - game changer for Korean study', score: 287, depth: 0 },
    ]
  },
  {
    id: 'demo7', subreddit: 'kdramas',
    title: '"Lovely Runner" just became my all-time favorite - the ending destroyed me',
    url: 'https://reddit.com/r/kdramas/demo7', score: 2876, commentCount: 334,
    createdAt: new Date(Date.now() - 36 * 3600000).toISOString(), flair: 'Review',
    comments: [
      { id: 'c16', body: 'Byeon Woo-seok was absolutely robbed at every award ceremony', score: 654, depth: 0 },
      { id: 'c17', body: 'The time travel plot was actually coherent unlike most dramas', score: 432, depth: 0 },
    ]
  },
  {
    id: 'demo8', subreddit: 'kdramas',
    title: 'Why is "Pachinko" season 2 not talked about more?? It\'s masterpiece level',
    url: 'https://reddit.com/r/kdramas/demo8', score: 1654, commentCount: 201,
    createdAt: new Date(Date.now() - 48 * 3600000).toISOString(), flair: 'Discussion',
    comments: [
      { id: 'c18', body: 'Pachinko deserves every award. The generational storytelling is unmatched.', score: 487, depth: 0 },
      { id: 'c19', body: 'Lee Min-ho in period drama is absolutely it', score: 312, depth: 0 },
    ]
  },
  {
    id: 'demo9', subreddit: 'koreatravel',
    title: 'Seoul travel guide - filming locations from my favorite kdramas!',
    url: 'https://reddit.com/r/koreatravel/demo9', score: 892, commentCount: 67,
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(), flair: 'Travel Tips',
    comments: [
      { id: 'c20', body: 'Bukchon Hanok Village from Crash Landing on You is beautiful in person', score: 234, depth: 0 },
    ]
  },
  {
    id: 'demo10', subreddit: 'kdramas',
    title: '"Squid Game" season 3 trailer reaction - community thoughts',
    url: 'https://reddit.com/r/kdramas/demo10', score: 5234, commentCount: 789,
    createdAt: new Date(Date.now() - 1 * 3600000).toISOString(), flair: 'News',
    comments: [
      { id: 'c21', body: 'The trailer alone broke Netflix records. This is going to be insane.', score: 1432, depth: 0 },
      { id: 'c22', body: 'June cannot come fast enough', score: 876, depth: 0 },
    ]
  },
]

export const demoFlixPatrol: FlixPatrolEntry[] = [
  // Netflix Global - 한국 콘텐츠만
  { rank: 1, title: 'Squid Game', platform: 'netflix', region: 'Global', points: 4823, isKContent: true },
  { rank: 2, title: 'When the Stars Gossip', platform: 'netflix', region: 'Global', points: 2876, isKContent: true },
  { rank: 3, title: 'Pachinko', platform: 'netflix', region: 'Global', points: 1987, isKContent: true },
  { rank: 4, title: 'Sweet Home', platform: 'netflix', region: 'Global', points: 1654, isKContent: true },
  { rank: 5, title: 'Lovely Runner', platform: 'netflix', region: 'Global', points: 1287, isKContent: true },
  { rank: 6, title: 'My Mister', platform: 'netflix', region: 'Global', points: 987, isKContent: true },
  { rank: 7, title: 'Crash Landing on You', platform: 'netflix', region: 'Global', points: 876, isKContent: true },
  { rank: 8, title: 'Juvenile Justice', platform: 'netflix', region: 'Global', points: 754, isKContent: true },

  // Netflix US - 한국 콘텐츠만
  { rank: 1, title: 'Squid Game', platform: 'netflix', region: 'US', points: 5210, isKContent: true },
  { rank: 2, title: 'When the Stars Gossip', platform: 'netflix', region: 'US', points: 2654, isKContent: true },
  { rank: 3, title: 'Pachinko', platform: 'netflix', region: 'US', points: 1876, isKContent: true },
  { rank: 4, title: 'Sweet Home', platform: 'netflix', region: 'US', points: 1432, isKContent: true },
  { rank: 5, title: 'Lovely Runner', platform: 'netflix', region: 'US', points: 1102, isKContent: true },

  // Netflix Korea
  { rank: 1, title: 'When the Stars Gossip', platform: 'netflix', region: 'Korea', points: 3210, isKContent: true },
  { rank: 2, title: 'Squid Game', platform: 'netflix', region: 'Korea', points: 2987, isKContent: true },
  { rank: 3, title: 'My Mister', platform: 'netflix', region: 'Korea', points: 1876, isKContent: true },
  { rank: 4, title: 'Signal', platform: 'netflix', region: 'Korea', points: 1543, isKContent: true },
  { rank: 5, title: 'Reply 1988', platform: 'netflix', region: 'Korea', points: 1234, isKContent: true },

  // Disney+ Global - 한국 콘텐츠만
  { rank: 1, title: 'Moving', platform: 'disney', region: 'Global', points: 1876, isKContent: true },
  { rank: 2, title: 'Bloodhounds', platform: 'disney', region: 'Global', points: 1432, isKContent: true },
  { rank: 3, title: 'Connect', platform: 'disney', region: 'Global', points: 987, isKContent: true },
  { rank: 4, title: 'Kiss Sixth Sense', platform: 'disney', region: 'Global', points: 765, isKContent: true },

  // Apple TV+ - 한국 콘텐츠만
  { rank: 1, title: 'Pachinko', platform: 'apple', region: 'Global', points: 2102, isKContent: true },
  { rank: 2, title: 'Pachinko', platform: 'apple', region: 'US', points: 1876, isKContent: true },
]

export const demoMyDramaList: MyDramaListEntry[] = [
  {
    rank: 1, title: 'When the Stars Gossip', year: 2025, rating: 9.1, votes: 45210,
    episodes: 16, genres: ['Romance', 'Comedy', 'Drama'],
    actors: ['Gong Hyo-jin', 'Lee Min-ho'], url: 'https://mydramalist.com/when-stars-gossip'
  },
  {
    rank: 2, title: 'Lovely Runner', year: 2024, rating: 9.0, votes: 87654,
    episodes: 16, genres: ['Romance', 'Fantasy', 'Time Travel'],
    actors: ['Byeon Woo-seok', 'Kim Hye-yoon'], url: 'https://mydramalist.com/lovely-runner'
  },
  {
    rank: 3, title: 'My Mister', year: 2018, rating: 9.4, votes: 156789,
    episodes: 16, genres: ['Drama', 'Life', 'Melodrama'],
    actors: ['Lee Sun-kyun', 'IU'], url: 'https://mydramalist.com/my-mister'
  },
  {
    rank: 4, title: 'Squid Game', year: 2021, rating: 8.7, votes: 234567,
    episodes: 9, genres: ['Thriller', 'Survival', 'Mystery'],
    actors: ['Lee Jung-jae', 'Park Hae-soo', 'Jung Ho-yeon'], url: 'https://mydramalist.com/squid-game'
  },
  {
    rank: 5, title: 'Crash Landing on You', year: 2019, rating: 8.9, votes: 198432,
    episodes: 16, genres: ['Romance', 'Drama', 'Military'],
    actors: ['Hyun Bin', 'Son Ye-jin'], url: 'https://mydramalist.com/crash-landing'
  },
  {
    rank: 6, title: 'Moving', year: 2023, rating: 9.2, votes: 67891,
    episodes: 20, genres: ['Action', 'Superhero', 'Family'],
    actors: ['Jo In-sung', 'Han Hyo-joo', 'Ryu Seung-ryong'], url: 'https://mydramalist.com/moving'
  },
  {
    rank: 7, title: 'Pachinko', year: 2022, rating: 9.1, votes: 54321,
    episodes: 8, genres: ['Historical', 'Family', 'Drama'],
    actors: ['Lee Min-ho', 'Kim Min-ha', 'Youn Yuh-jung'], url: 'https://mydramalist.com/pachinko'
  },
  {
    rank: 8, title: 'Sweet Home', year: 2020, rating: 8.1, votes: 89012,
    episodes: 10, genres: ['Horror', 'Thriller', 'Supernatural'],
    actors: ['Song Kang', 'Lee Jin-wook'], url: 'https://mydramalist.com/sweet-home'
  },
  {
    rank: 9, title: 'Bloodhounds', year: 2023, rating: 8.4, votes: 34567,
    episodes: 8, genres: ['Action', 'Thriller', 'Crime'],
    actors: ['Woo Do-hwan', 'Lee Sang-yi'], url: 'https://mydramalist.com/bloodhounds'
  },
  {
    rank: 10, title: 'It\'s Okay to Not Be Okay', year: 2020, rating: 8.9, votes: 143210,
    episodes: 16, genres: ['Romance', 'Psychological', 'Drama'],
    actors: ['Kim Soo-hyun', 'Seo Ye-ji'], url: 'https://mydramalist.com/its-okay'
  },
]
