const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const getFollowingPeopleOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `
    SELECT 
    following_user_id FROM follower 
    INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE user.username = '${username}';`;

  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

// Tweet Access Token
const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT * FROM tweet INNER JOIN follower ON 
    tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = '${tweetId}' AND 
    follower_user_id = '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

// Authentication Jwt Token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// API -- 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  // const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createNewUser = `
        INSERT INTO user (username , password , name , gender)
        VALUES (
            '${username}','${hashedPassword}', '${name}' , '${gender}'
        );`;
      await db.run(createNewUser);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

// Login Twitter user - API -- 2
app.post("/Login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordHashed = await bcrypt.compare(password, dbUser.password);
    if (isPasswordHashed === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API -3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const followingPeopleIds = await getFollowingPeopleOfUser(username);

  const getTweetsQuery = `
    SELECT username , tweets , date_time as dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE 
    user.user_id IN (${followingPeopleIds})
    ORDER BY date_time DESC 
    LIMIT 4;`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API - 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowingUsersQuery = `
  SELECT 
   name 
  FROM 
   follower 
  INNER JOIN 
   user
  ON 
   user.user_id = follower.following_user_id
  WHERE 
   follower_user_id  = '${userId}'; `;

  const followingPeople = await db.all(getFollowingUsersQuery);
  response.send(followingPeople);
});

// API - 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;

  const getFollowersQuery = `
    SELECT DISTINCT name FROM follower 
    INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE following_user_id = '${userId}';`;

  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

// API - 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `SELECT tweet, 
    (SELECT COUNT() FROM Like WHERE tweet_id = '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
    date_time AS dateTime
    
    FROM tweet 
    
    WHERE tweet.tweet_id = '${tweetId}';`;

  const tweet = await db.get(getTweetQuery);
  response.send(tweet);
});

// API -7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
    SELECT username FROM user INNER JOIN like ON user.user_id = like.user_id
    WHERE tweet_id = '${tweetId}';`;
    const likedUsers = await db.all(getLikesQuery);
    const usersArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: usersArray });
  }
);

// API - 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
    SELECT username FROM user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE tweet_id = '${tweetId}';`;
    const RepliedUsers = await db.all(getRepliesQuery);
    const usersArray = RepliedUsers.map((eachUser) => eachUser.username);
    response.send({ replies: usersArray });
  }
);

// API- 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetsQuery = `
    SELECT tweet,
    COUNT (DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id) AS replies,
    date_time AS dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// API -10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `
    INSERT INTO tweet (tweet ,user_id, date_time)
    VALUES ('${tweet}' , '${userId}' ,'${dateTime}')`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// aPI -11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getTheTweetQuery = `
    SELECT * FROM tweet WHERE user_id = '${userId}' 
    AND tweet_id = '${tweetId}';`;
    const tweet = await db.get(getTheTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
