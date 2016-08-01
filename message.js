var Message = require('../models/message');
var User = require('../models/user');
var mongoose = require('../libs/mongoose');
var async = require('async');
var logger = require('../libs/logger')(module);

exports.getDialogs = function (req, res, next) {

    // get current user id
    var user_id = mongoose.Types.ObjectId(req.user._id);

    async.waterfall([
        // group messages
        function(callback) {
            Message
                .aggregate([
                    {
                        $match: {
                            $or: [
                                {receiver: user_id},
                                {sender: user_id}
                            ]
                        }
                    },
                    {
                        $sort: {createdAt: -1}
                    },
                    {
                        $group: {
                            _id: {
                                $cond: {
                                    if: {
                                        $eq: ['$sender', user_id]
                                    },
                                    then: '$receiver',
                                    else: '$sender'
                                }
                            },
                            sender: {$first: '$sender'},
                            message: {$first: '$message'},
                            createdAt: {$first: '$createdAt'},
                            message_id: {$first: '$_id'},
                            unread: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                {$eq: ['$read', false]},
                                                {$eq: ['$receiver', user_id]}
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            companion: '$_id',
                            message: '$message',
                            sender: '$sender',
                            createdAt: '$createdAt',
                            message_id: '$message_id',
                            unread: '$unread'
                        }
                    }
                ])
                .exec(callback);
        },
        // get companion full data
        function(groups, callback){
            User
                .populate(groups, {
                    path: 'companion',
                    select: 'username avatar firstName lastName'
                }, callback);
        }
    ], function(err, results) {
        if(err) {
            logger.error(err);

            return next(err);
        }

        res.json(results);
    });
};


exports.getDialogMessages = function (req, res, next) {

    var dialog_id = req.params.id;
    var user_id = req.user._id;
    var MESSAGES_LIMIT = 50;
    var MESSAGES_OFFSET = parseInt(req.query.offset) || 0;


    if (!mongoose.Types.ObjectId.isValid(dialog_id)) {
        return res.status(400).json({
            message: 'Dialog ID is not valid.'
        });
    }

    var sql_query = {
        $or: [
            {
                sender: user_id,
                receiver: dialog_id
            },
            {
                sender: dialog_id,
                receiver: user_id
            }
        ]
    };

    async.parallel({
        dialog: function(callback) {
            User
                .findById(dialog_id)
                .exec(function (err, user) {
                    if(err) return callback(err);
                    if(!user) return callback(new Error('Companion not found.'));

                    callback(null);
                });
        },
        total: function (callback) {
            Message
                .count(sql_query)
                .exec(callback);
        },
        messages: function (callback) {
            Message
                .find(sql_query, '-updatedAt')
                .populate('sender', 'username firstName lastName avatar')
                .populate('receiver', 'username firstName lastName avatar')
                .sort({'createdAt': -1})
                .limit(MESSAGES_LIMIT)
                .skip(MESSAGES_OFFSET)
                .exec(callback);
        }
    }, function (err, results) {
        if (err) {
            logger.error(err);

            return next(err);
        }

        res.json(results);
    });
};


exports.getUnreadMessagesCount = function (req, res, next) {
    Message
        .count({
            receiver: req.user._id,
            read: false
        })
        .exec(function (err, count) {
            if (err) {
                logger.error(err);

                return next(err);
            }

            res.json({
                unread: count
            });
        });
};
