type FewShotExample = {
  input: string;
  output: Record<string, string | number | boolean>;
};

function buildExampleBlock(
  groupName: string,
  examples: FewShotExample[],
): string {
  return [
    `${groupName} 示例：`,
    ...examples.flatMap((example, index) => [
      `${groupName} 示例 ${index + 1} 输入：${example.input}`,
      `${groupName} 示例 ${index + 1} 输出：${JSON.stringify(example.output)}`,
    ]),
  ].join('\n');
}

function buildLogBodyFewShotExamples(): string {
  return buildExampleBlock('logBody', [
    {
      input: '今早体重 55.3kg',
      output: {
        mode: 'command',
        intent: 'weight',
        reply: '我知道你的意思了。',
        weightKg: 55.3,
      },
    },
    {
      input: '今天体脂 24.8%，BMI 20.1',
      output: {
        mode: 'command',
        intent: 'weight',
        reply: '我知道你的意思了。',
        bodyFatPct: 24.8,
        bmi: 20.1,
      },
    },
    {
      input: '今早 55.2kg，BMI 20.1，体脂 23.8%',
      output: {
        mode: 'command',
        intent: 'weight',
        reply: '我知道你的意思了。',
        weightKg: 55.2,
        bmi: 20.1,
        bodyFatPct: 23.8,
      },
    },
    {
      input: '昨天体重 55.1kg',
      output: {
        mode: 'command',
        intent: 'weight',
        reply: '我知道你的意思了。',
        targetDate: '2026-04-02',
        weightKg: 55.1,
      },
    },
    {
      input: '今天身体数据更新一下',
      output: {
        mode: 'clarify',
        intent: 'weight',
        reply:
          '你这次要记什么身体数据？至少告诉我体重，或者 BMI、体脂率中的一项。',
      },
    },
  ]);
}

function buildLogMealFewShotExamples(): string {
  return buildExampleBlock('logMeal', [
    {
      input: '早餐吃了两个鸡蛋一杯豆浆',
      output: {
        mode: 'command',
        intent: 'food',
        reply: '我知道你的意思了。',
        mealType: 'breakfast',
        mealText: '两个鸡蛋一杯豆浆',
      },
    },
    {
      input: '午饭 半碗米饭 + 青椒牛肉 + 一杯酸奶',
      output: {
        mode: 'command',
        intent: 'food',
        reply: '我知道你的意思了。',
        mealType: 'lunch',
        mealText: '半碗米饭 青椒牛肉 一杯酸奶',
      },
    },
    {
      input: '昨天晚饭吃了牛肉粉',
      output: {
        mode: 'command',
        intent: 'food',
        reply: '我知道你的意思了。',
        targetDate: '2026-04-02',
        mealType: 'dinner',
        mealText: '牛肉粉',
      },
    },
    {
      input: '我刚吃了个苹果，大概多少热量',
      output: {
        mode: 'command',
        intent: 'food_estimate',
        reply: '我知道你的意思了。',
        mealText: '苹果',
      },
    },
    {
      input: '今天晚上吃了啥来着',
      output: {
        mode: 'clarify',
        intent: 'food',
        reply: '你这餐具体吃了什么？补一句食物内容我就能继续。',
      },
    },
  ]);
}

function buildLogSleepFewShotExamples(): string {
  return buildExampleBlock('logSleep', [
    {
      input: '更新4月2号的睡眠 2:42-8:20，一般',
      output: {
        mode: 'command',
        intent: 'sleep',
        reply: '我知道你的意思了。',
        targetDate: '2026-04-02',
        sleepStart: '02:42',
        sleepEnd: '08:20',
        sleepQuality: 'normal',
      },
    },
    {
      input: '前天睡了 23:30 到 07:10',
      output: {
        mode: 'command',
        intent: 'sleep',
        reply: '我知道你的意思了。',
        targetDate: '2026-04-01',
        sleepStart: '23:30',
        sleepEnd: '07:10',
      },
    },
  ]);
}

function buildSummarizeNutritionFewShotExamples(): string {
  return buildExampleBlock('summarizeNutrition', [
    {
      input: '今天吃了多少热量',
      output: {
        mode: 'command',
        intent: 'nutrition_summary',
        reply: '我知道你的意思了。',
      },
    },
    {
      input: '今天蛋白质够不够',
      output: {
        mode: 'command',
        intent: 'nutrition_summary',
        reply: '我知道你的意思了。',
      },
    },
    {
      input: '昨天饮食总共热量多少',
      output: {
        mode: 'command',
        intent: 'nutrition_summary',
        reply: '我知道你的意思了。',
        targetDate: '2026-04-02',
      },
    },
  ]);
}

function buildAdjustStockFewShotExamples(): string {
  return buildExampleBlock('adjustStock', [
    {
      input: '鸡蛋 +6个，牛奶 +2盒',
      output: {
        mode: 'command',
        intent: 'stock_adjust',
        reply: '我知道你的意思了。',
      },
    },
    {
      input: '把鸡胸肉库存改成 500g',
      output: {
        mode: 'command',
        intent: 'stock_set',
        reply: '我知道你的意思了。',
        stockItemName: '鸡胸肉',
        stockQuantity: 500,
        stockUnit: 'g',
      },
    },
    {
      input: '西兰花减 200g',
      output: {
        mode: 'command',
        intent: 'stock_adjust',
        reply: '我知道你的意思了。',
        stockItemName: '西兰花',
        stockQuantity: -200,
        stockUnit: 'g',
      },
    },
    {
      input: '库存更新一下',
      output: {
        mode: 'clarify',
        intent: 'stock_adjust',
        reply: '你要更新哪几项库存？把食材名和数量一起发我。',
      },
    },
  ]);
}

function buildLookupStockFewShotExamples(): string {
  return buildExampleBlock('lookupStock', [
    {
      input: '现在还有哪些库存',
      output: {
        mode: 'command',
        intent: 'stock_check',
        reply: '我知道你的意思了。',
      },
    },
    {
      input: '鸡蛋还剩多少',
      output: {
        mode: 'command',
        intent: 'stock_check',
        reply: '我知道你的意思了。',
        stockQuery: '鸡蛋',
      },
    },
    {
      input: '帮我看下牛奶库存',
      output: {
        mode: 'command',
        intent: 'stock_check',
        reply: '我知道你的意思了。',
        stockQuery: '牛奶',
      },
    },
  ]);
}

function buildChatBoundaryFewShotExamples(): string {
  return buildExampleBlock('chat', [
    {
      input: 'BMI 怎么算？',
      output: {
        mode: 'reply',
        intent: 'chat',
        reply: 'BMI 等于体重公斤数除以身高米数的平方。',
      },
    },
  ]);
}

export function buildPlanningFewShotExamples(): string {
  return [
    '下面是按工具和能力分组的输入输出示例，请模仿它们的判断方式和 JSON 结构：',
    buildLogBodyFewShotExamples(),
    buildLogSleepFewShotExamples(),
    buildLogMealFewShotExamples(),
    buildSummarizeNutritionFewShotExamples(),
    buildAdjustStockFewShotExamples(),
    buildLookupStockFewShotExamples(),
    buildChatBoundaryFewShotExamples(),
  ].join('\n\n');
}
