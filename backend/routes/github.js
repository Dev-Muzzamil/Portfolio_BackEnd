const express = require('express');
const axios = require('axios');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get GitHub user profile (public)
router.get('/profile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const response = await axios.get(`https://api.github.com/users/${username}`, {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    res.json({ profile: response.data });
  } catch (error) {
    console.error('GitHub profile fetch error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to fetch GitHub profile' });
  }
});

// Get GitHub repositories (public)
router.get('/repos/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { sort = 'updated', per_page = 10, page = 1 } = req.query;

    const response = await axios.get(`https://api.github.com/users/${username}/repos`, {
      params: {
        sort,
        per_page: Math.min(parseInt(per_page), 100), // Max 100 per page
        page: parseInt(page),
        type: 'owner'
      },
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    res.json({ repositories: response.data });
  } catch (error) {
    console.error('GitHub repos fetch error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to fetch GitHub repositories' });
  }
});

// Get GitHub contribution stats (public)
router.get('/contributions/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Get user events (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const eventsResponse = await axios.get(`https://api.github.com/users/${username}/events`, {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const events = eventsResponse.data;
    const recentEvents = events.filter(event => new Date(event.created_at) > thirtyDaysAgo);

    // Calculate contribution stats
    const stats = {
      totalContributions: recentEvents.length,
      contributionsByType: {},
      recentActivity: recentEvents.slice(0, 10).map(event => ({
        type: event.type,
        repo: event.repo.name,
        created_at: event.created_at,
        action: event.payload.action || 'created'
      }))
    };

    // Group by event type
    recentEvents.forEach(event => {
      stats.contributionsByType[event.type] = (stats.contributionsByType[event.type] || 0) + 1;
    });

    res.json({ stats });
  } catch (error) {
    console.error('GitHub contributions fetch error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to fetch GitHub contributions' });
  }
});

// Get GitHub contribution calendar (last year) via GraphQL
router.get('/contributionCalendar/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const query = `
      query($login: String!) {
        user(login: $login) {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                  weekday
                }
              }
            }
          }
        }
      }
    `;

    const variables = { login: username };

    const response = await axios.post('https://api.github.com/graphql', { query, variables }, {
      headers: {
        'Authorization': `bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const calendar = response.data?.data?.user?.contributionsCollection?.contributionCalendar;
    if (!calendar) {
      return res.status(404).json({ message: 'Contribution calendar not available' });
    }

    // Normalize weeks to a simple structure
    const weeks = (calendar.weeks || []).map(week => ({
      days: (week.contributionDays || []).map(d => ({
        date: d.date,
        count: d.contributionCount,
        weekday: d.weekday
      }))
    }));

    res.json({ calendar: { totalContributions: calendar.totalContributions || 0, weeks } });
  } catch (error) {
    console.error('GitHub contribution calendar fetch error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to fetch GitHub contribution calendar' });
  }
});

// Get GitHub languages stats (public)
router.get('/languages/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Get user's repositories
    const reposResponse = await axios.get(`https://api.github.com/users/${username}/repos`, {
      params: {
        per_page: 100,
        type: 'owner'
      },
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const repos = reposResponse.data;
    const languageStats = {};

    // Get language stats for each repository
    for (const repo of repos.slice(0, 20)) { // Limit to first 20 repos for performance
      if (repo.fork) continue; // Skip forks

      try {
        const langResponse = await axios.get(repo.languages_url, {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        const languages = langResponse.data;
        for (const [language, bytes] of Object.entries(languages)) {
          languageStats[language] = (languageStats[language] || 0) + bytes;
        }
      } catch (langError) {
        console.warn(`Failed to fetch languages for ${repo.name}:`, langError.message);
      }
    }

    // Convert bytes to percentages
    const totalBytes = Object.values(languageStats).reduce((sum, bytes) => sum + bytes, 0);
    const languagePercentages = {};

    for (const [language, bytes] of Object.entries(languageStats)) {
      languagePercentages[language] = Math.round((bytes / totalBytes) * 100);
    }

    res.json({ languages: languagePercentages });
  } catch (error) {
    console.error('GitHub languages fetch error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to fetch GitHub languages' });
  }
});

// Get specific repository details (public)
router.get('/repo/:username/:repo', async (req, res) => {
  try {
    const { username, repo } = req.params;

    const response = await axios.get(`https://api.github.com/repos/${username}/${repo}`, {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const repoData = response.data;

    // Get README if available
    let readme = null;
    try {
      const readmeResponse = await axios.get(`https://api.github.com/repos/${username}/${repo}/readme`, {
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      readme = readmeResponse.data;
    } catch (readmeError) {
      // README not found, continue without it
    }

    res.json({
      repository: {
        name: repoData.name,
        description: repoData.description,
        url: repoData.html_url,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        language: repoData.language,
        updated_at: repoData.updated_at,
        topics: repoData.topics || [],
        readme: readme
      }
    });
  } catch (error) {
    console.error('GitHub repo fetch error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Failed to fetch GitHub repository' });
  }
});

module.exports = router;