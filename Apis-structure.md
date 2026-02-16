🔐 AUTH (USER)
1️⃣ Register

POST /auth/register

Body:

{
  "name": "Mohit",
  "email": "mohit@gmail.com",
  "password": "password123"
}


Response:

{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "name": "Mohit", "email": "mohit@gmail.com" }
}

2️⃣ Login

POST /auth/login

Body:

{
  "email": "mohit@gmail.com",
  "password": "password123"
}


Response:

{
  "accessToken": "...",
  "refreshToken": "..."
}

3️⃣ Refresh

POST /auth/refresh

Body:

{
  "refreshToken": "..."
}


Response:

{
  "accessToken": "..."
}

4️⃣ Logout

POST /auth/logout

Response:

{ "message": "Logout successful" }

💰 WALLET
5️⃣ Get Balance

GET /wallet/balance

Response:

{ "walletBalance": 500 }

6️⃣ Transactions

GET /wallet/transactions?page=1&limit=10

Response:

{
  "total": 5,
  "transactions": [ ... ]
}

7️⃣ Recharge (Dummy)

POST /wallet/recharge

Body:

{ "amount": 500 }


Response:

{
  "message": "Wallet recharged",
  "walletBalance": 1000
}

⚖️ LAWYER
8️⃣ Register Lawyer

POST /lawyer/register

Body:

{
  "name": "Adv Sharma",
  "email": "sharma@gmail.com",
  "password": "password123",
  "specialization": ["criminal"],
  "ratePerMinute": 20
}


Response:

{ "message": "Lawyer registered" }

9️⃣ Login Lawyer

POST /lawyer/login

Body:

{
  "email": "sharma@gmail.com",
  "password": "password123"
}


Response:

{
  "accessToken": "...",
  "refreshToken": "..."
}

🔟 Get Lawyers

GET /lawyer

Response:

[
  {
    "_id": "...",
    "name": "Adv Sharma",
    "ratePerMinute": 20,
    "isOnline": true
  }
]

11️⃣ Get Lawyer By ID

GET /lawyer/:lawyerId

Response:

{
  "_id": "...",
  "name": "Adv Sharma",
  "specialization": ["criminal"],
  "rating": 4.5
}

12️⃣ Update Availability (Lawyer)

PATCH /lawyer/availability

Body:

{ "isOnline": true }


Response:

{ "message": "Availability updated" }

13️⃣ Verify Lawyer (Admin)

PATCH /lawyer/:lawyerId/verify

Response:

{ "message": "Lawyer verified" }

📞 CONSULTATION
14️⃣ Start Consultation

POST /consult/start

Body:

{
  "lawyerId": "lawyer_id",
  "type": "CHAT"
}


Response:

{
  "sessionId": "...",
  "ratePerMinute": 20
}

15️⃣ End Consultation

POST /consult/:sessionId/end

Response:

{
  "totalAmount": 120,
  "remainingBalance": 380
}

💬 CHAT
16️⃣ Get Messages

GET /chat/:sessionId?page=1&limit=20

Response:

{
  "messages": [
    {
      "content": "Hello",
      "status": "SEEN"
    }
  ]
}

⭐ REVIEW
17️⃣ Submit Review

POST /review

Body:

{
  "sessionId": "...",
  "rating": 5,
  "comment": "Very helpful"
}


Response:

{ "message": "Review submitted" }

💼 LAWYER EARNINGS
18️⃣ Get Earnings

GET /api/lawyer/earnings/summary

Response:

{
  "totalEarnings": 5000,
  "todayEarnings": 200,
  "totalSessions": 25
}

🔌 SOCKET EVENTS (Not REST)

join_session

send_message

message_delivered

mark_seen

leave_session