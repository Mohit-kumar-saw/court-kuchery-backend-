🔐 AUTH (User)

POST /auth/register

POST /auth/login

POST /auth/refresh

POST /auth/logout



💰 WALLET

GET /wallet/balance

GET /wallet/transactions

POST /wallet/recharge (dummyRecharge)



⚖️ LAWYER

POST /lawyer/register

POST /lawyer/login

GET /lawyer

GET /lawyer/:lawyerId

PATCH /lawyer/availability

PATCH /lawyer/:lawyerId/verify



📞 CONSULTATION

POST /consult/start

POST /consult/:sessionId/end



💬 CHAT (REST)

GET /chat/:sessionId


(Socket events not counted as REST APIs)



⭐ REVIEW

POST /review



💼 LAWYER EARNINGS

GET /api/lawyer/earnings/summary



