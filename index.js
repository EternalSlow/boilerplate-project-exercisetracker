process.env.TZ = 'UTC';
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// MongoDB Connection - removed deprecated options
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/exercise-tracker';
mongoose.connect(MONGO_URI);

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
});

const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, required: true },
});

const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

// 1. POST /api/users - Create a new user
app.post('/api/users', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const newUser = new User({ username });
    const savedUser = await newUser.save();
    res.json({ username: savedUser.username, _id: savedUser._id });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/users - Get list of all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username _id');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 3. POST /api/users/:_id/exercises - Add an exercise to a user
app.post('/api/users/:_id/exercises', async (req, res) => {
  try {
    const { _id } = req.params;
    let { description, duration, date } = req.body;

    // Validate required fields
    if (!description || !duration) {
      return res.status(400).json({ error: 'description and duration are required' });
    }

    // Find user
    const user = await User.findById(_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse duration as integer
    const parsedDuration = parseInt(duration);
    if (isNaN(parsedDuration) || parsedDuration <= 0) {
      return res.status(400).json({ error: 'duration must be a positive integer' });
    }

    // Parse date: if not provided, use current date
    let exerciseDate;
    if (date) {
      exerciseDate = new Date(date);
      if (isNaN(exerciseDate.getTime())) {
        exerciseDate = new Date();
      }
    } else {
      exerciseDate = new Date();
    }

    // Create and save exercise
    const exercise = new Exercise({
      userId: _id,
      description,
      duration: parsedDuration,
      date: exerciseDate,
    });
    await exercise.save();

    // Return response with user object + exercise fields
    // Using toDateString() to ensure the expected format
    res.json({
      username: user.username,
      _id: user._id,
      description: exercise.description,
      duration: exercise.duration,
      date: exercise.date.toDateString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/users/:_id/logs - Get full exercise log of a user with optional filters
app.get('/api/users/:_id/logs', async (req, res) => {
  try {
    const { _id } = req.params;
    let { from, to, limit } = req.query;

    // Find user
    const user = await User.findById(_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build query for exercises
    let query = { userId: _id };

    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        fromDate.setUTCHours(0, 0, 0, 0);
        query.date = { ...query.date, $gte: fromDate };
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        toDate.setUTCHours(23, 59, 59, 999);
        query.date = { ...query.date, $lte: toDate };
      }
    }

    // Get total count of exercises for this user (unfiltered)
    const totalCount = await Exercise.countDocuments({ userId: _id });

    // Fetch exercises with filters, sort by date ascending
    let exercisesQuery = Exercise.find(query).sort({ date: 'asc' });
    if (limit) {
      const parsedLimit = parseInt(limit);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        exercisesQuery = exercisesQuery.limit(parsedLimit);
      }
    }

    const exercises = await exercisesQuery;

    // Format the log array using toDateString() for the date property
    const log = exercises.map(ex => ({
      description: ex.description,
      duration: ex.duration,
      date: ex.date.toDateString(),
    }));

    res.json({
      username: user.username,
      _id: user._id,
      count: totalCount,
      log,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
