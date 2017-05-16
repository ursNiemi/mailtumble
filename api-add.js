'use strict';

var jwt = require('jsonwebtoken');
const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const cert = Object.keys(event.stageVariables)
        .filter(varName => varName.startsWith('PUBLIC_KEY_'))
        .sort()
        .map(varName => event.stageVariables[varName])
        .join('')
        .replace(/&/g, ' ')
        .replace(/_/g, '+')
        .replace(/:/g, '\n')
        
    const get = (obj, key) => {
        return key.split(".").reduce(function(o, x) {
            return (typeof o == "undefined" || o === null) ? o : o[x];
        }, obj);
    }

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '201',
        body: err ? err.message : '',
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
    });

    const token = get(event, 'headers.Authorization')

    if (typeof token === 'undefined') {
        done(new Error('Authorization failed'));
        return;
    }

    jwt.verify(token.split(' ')[1], cert, function(err, decoded) {
        if (err) {
            done(new Error('Authorization failed: ' + token.split(' ')[1]));
            return;
        }

        if (decoded.scopes.indexOf('write') == -1 && decoded.scopes.indexOf('*') == -1) {
            done(new Error('You are using a read-only token'));
            return;
        }

        let email = JSON.parse(event.body)

        dynamo.updateItem({
            TableName: event.stageVariables.DYNAMO_TABLE,
            Key: {
                'alias': email.alias
            },
            UpdateExpression: "set #email = :email, #user_id = :user_id",
            ExpressionAttributeValues: {
                ":user_id": email.user_id,
                ":email": email.email
            },
            ExpressionAttributeNames: {
                "#email": email,
                "#user_id": "user_id"
            }
        }, done);
    });
};

