# Trefla Back-End(npm)

## Tech stacks

- node.js
- mysql
- socket.io

## MySQL tricks

## JSON ([documentation](https://dev.mysql.com/doc/refman/8.0/en/json-search-functions.html))
- JSON Extract: JSON_EXTRACT

- Check if JSON array contains a specific value

```sql
SELECT * FROM users WHERE JSON_SEARCH(bouquet, 'one', '3') IS NOT NULL
```

## Socket.io

### emit from server

- return response

```js
  socket.emit('event_name', data);
```

- send to a single user
```js
  io.to(socket_id).emit('event_name' , data);
```

- send to room partners

```js
 socket.to(room_id).emit()
```

- send to all users in room
  io.to(room_id).emit();