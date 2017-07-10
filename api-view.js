'use strict';

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();
var jwt = require('jsonwebtoken');

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const alias = event.path.split('/').pop()

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

    const token = get(event, 'headers.Authorization')

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : (res.Items.length > 0 ? '200' : '404'),
        body: err ? err.message : (res.Items.length > 0 ? JSON.stringify(res.Items[0]) : ''),
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
    });

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
            done(new Error('Your token does not have the scopes'));
            return;
        }

        dynamo.query({
            TableName: event.stageVariables.DYNAMO_TABLE,
            KeyConditionExpression: "#alias = :alias",
            ExpressionAttributeNames: {
                "#alias": "alias"
            },
            ExpressionAttributeValues: {
                ":alias": alias
            }
        }, done);
    });
};

