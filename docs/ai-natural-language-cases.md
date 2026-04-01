# AI Natural Language Cases

This file is a manual case list for real-world phrases you may say to the bot.
Use it to record the boundary between `reply`, `clarify`, and `execute`, and to keep examples that should continue working after prompt or logic changes.

## How To Use

1. Add phrases you actually say in daily usage.
2. Keep expected behavior short and concrete.
3. When the bot behaves differently from expectation, add a note before changing code or prompts.
4. Prefer realistic language over idealized command-like wording.

## Template

| Input | Expected Mode | Expected Intent | Expected Stage | Expected Behavior | Notes |
| ----- | ------------- | --------------- | -------------- | ----------------- | ----- |
|       |               |                 |                |                   |       |

## Seed Cases

| Input                                                                                                                                                                                                         | Expected Mode | Expected Intent | Expected Stage | Expected Behavior                                                                | Notes                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------- | -------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 昨晚11点睡，今天7点半醒，感觉还行                                                                                                                                                                             | command       | sleep           | execute        | Create or preview a sleep record                                                 | Basic natural sleep logging                                                                   |
| 早餐吃了西兰花                                                                                                                                                                                                | clarify       | food_estimate   | clarify        | Ask for quantity or clearer meal details                                         | Incomplete food info                                                                          |
| 300g                                                                                                                                                                                                          | command       | food_estimate   | execute        | Merge with previous clarify turn and continue food handling                      | Should only work after a food clarify                                                         |
| 不是300g，是250g                                                                                                                                                                                              | command       | food_estimate   | execute        | Merge correction into previous clarify turn                                      | Clarify follow-up correction                                                                  |
| 鸡蛋还有几个来着                                                                                                                                                                                              | command       | stock_check     | execute        | Return current stock summary                                                     | Natural stock lookup                                                                          |
| 更新一下库存，麻烦把这些东西添加到库存记录里：茼蒿 250g，鸡蛋15个，小番茄100g，欧包57g，牛奶2.8L，有机西兰花300g，海鲜菇250g，菠菜600g，苋菜300g，枸杞芽250g，娃娃菜400g，荔浦芋头157g，西葫芦1根，西兰花280g | command       | stock_adjust    | execute        | Show a batch stock preview first, then write all parsed items after confirmation | Real personal batch stock update case; previously exposed the single-item stock AI limitation |
| 今天想聊聊跑步节奏                                                                                                                                                                                            | reply         | chat            | reply          | Chat normally without writing records                                            | New topic, not a record                                                                       |
| 我今天应该少吃点吗                                                                                                                                                                                            | reply         | chat            | reply          | Normal AI chat, no sheet write                                                   | No health-context injection yet                                                               |
