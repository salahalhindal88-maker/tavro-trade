// ╔══════════════════════════════════════════════════════════════════╗
// ║   Steal a Brainrot — Trade Bot  v4.1 (أوامر عربية)            ║
// ║   ميزات: تريد | طلب شي | عروض متعددة | وسيط | صور | DM        ║
// ╚══════════════════════════════════════════════════════════════════╝

const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, Events
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ══════════════════════════════════════════════════════
//  ⚙️  إعدادات — حطها في Railway كـ Environment Variables
// ══════════════════════════════════════════════════════
const TOKEN              = process.env.TOKEN              || 'YOUR_BOT_TOKEN';
const TRADE_CHANNEL_ID   = process.env.TRADE_CHANNEL_ID   || '1480361973538361344';
const REQUEST_CHANNEL_ID = process.env.REQUEST_CHANNEL_ID || '1480361973538361344';
const MM_ROLE_ID         = process.env.MM_ROLE_ID         || '1451449214906273953';
const MM_CATEGORY_ID           = process.env.MM_CATEGORY_ID           || '1477883142604853522';
const IMAGE_STORAGE_CHANNEL_ID = process.env.IMAGE_STORAGE_CHANNEL_ID || '1480489127643447338'; // قناة مخفية لتخزين الصور

// ══════════════════════════════════════════════════════
//  💾  التخزين في الذاكرة
// ══════════════════════════════════════════════════════
const activeTrades        = new Map(); // tradeId   → tradeData
const activeRequests      = new Map(); // requestId → requestData
const activeTickets       = new Map(); // channelId → ticketData
const pendingImageUploads = new Map(); // userId    → pendingData

// ══════════════════════════════════════════════════════
//  ✅  جاهز
// ══════════════════════════════════════════════════════
client.once(Events.ClientReady, () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
  client.user.setActivity('🔄 Steal a Brainrot Trades', { type: 3 });
});

// ══════════════════════════════════════════════════════
//  📨  الأوامر + التقاط الصور
//
//  الأوامر المتاحة (البادئة: !)
//  !تريد      ← القائمة الرئيسية (تريد أو طلب)
//  !طلب       ← إنشاء طلب مباشرة
//  !تريداتي   ← عرض التريدات النشطة
//  !طلباتي    ← عرض الطلبات النشطة
//  !مساعدة    ← قائمة المساعدة
// ══════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // ── التقاط الصور من المستخدمين الذين ينتظرون ──
  if (pendingImageUploads.has(message.author.id)) {
    const p = pendingImageUploads.get(message.author.id);
    const handlers = {
      seller_image:   () => handleSellerImageUpload(message, p),
      offer_image:    () => handleOfferImageUpload(message, p),
      request_image:  () => handleRequestImageUpload(message, p),
      supplier_image: () => handleSupplierImageUpload(message, p),
    };
    if (handlers[p.step]) { await handlers[p.step](); return; }
  }

  if (!message.content.startsWith('!')) return;
  const cmd = message.content.slice(1).trim().split(/ +/)[0];

  // ── قاموس الأوامر (عربي فقط) ──
  const cmds = {
    'تريد':    () => sendMainMenu(message),
    'طلب':     () => sendRequestForm(message),
    'تريداتي': () => handleViewTrades(message),
    'طلباتي':  () => handleViewRequests(message),
    'مساعدة':  () => handleHelp(message),
  };

  if (cmds[cmd]) {
    // ── حذف رسالة الأمر من الشات (تنظيف) ──
    try { await message.delete(); } catch {}
    await cmds[cmd]();
  }
});

// ══════════════════════════════════════════════════════
//  🏠  القائمة الرئيسية
// ══════════════════════════════════════════════════════
async function sendMainMenu(message) {
  const embed = new EmbedBuilder()
    .setColor('#FF6B35')
    .setTitle('🎮 Steal a Brainrot — مركز التريد')
    .setDescription('اختار نوع العملية اللي تبيها:')
    .addFields(
      { name: '🔄 تريد — عندي شي وأبي أبادله',        value: '> عندك Brainrot وتبي تبادله بشي ثاني',         inline: false },
      { name: '🛒 طلب — أبي شي ومعي ما يقابله',        value: '> تبي Brainrot معين وعندك شي تعرضه مقابله',    inline: false }
    )
    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: 'Steal a Brainrot Trading Bot', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  await message.channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      mkBtn(`create_trade_${message.author.id}`,   '🔄 إنشاء تريد', ButtonStyle.Primary),
      mkBtn(`create_request_${message.author.id}`, '🛒 إنشاء طلب',  ButtonStyle.Success),
      mkBtn('view_all',                            '📊 عرض الكل',   ButtonStyle.Secondary)
    )]
  });
}

// ══════════════════════════════════════════════════════
//  🛒  نموذج الطلب (أمر !طلب المباشر)
// ══════════════════════════════════════════════════════
async function sendRequestForm(message) {
  await message.channel.send({
    embeds: [new EmbedBuilder()
      .setColor('#00B4D8')
      .setTitle('🛒 طلب شي — Steal a Brainrot')
      .setDescription(
        '**خطوتين:**\n' +
        '1️⃣ اضغط **"إنشاء طلب"** وأدخل المعلومات\n' +
        '2️⃣ أرسل **صورة** للشي اللي تبيه (أو اكتب `skip`)\n\n' +
        '> اللي عنده الشي يرد عليك بعرضه'
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Steal a Brainrot Trading Bot', iconURL: client.user.displayAvatarURL() })
      .setTimestamp()
    ],
    components: [new ActionRowBuilder().addComponents(
      mkBtn(`create_request_${message.author.id}`, '🛒 إنشاء طلب', ButtonStyle.Success),
      mkBtn('view_requests',                        '📋 الطلبات',   ButtonStyle.Secondary)
    )]
  });
}

// ══════════════════════════════════════════════════════
//  🎛️  كل الـ Interactions
// ══════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {

  // ──────────────────────────────────────────────────
  //  🔘 أزرار
  // ──────────────────────────────────────────────────
  if (interaction.isButton()) {
    const id = interaction.customId;

    // ── فتح Modal تريد / طلب ─────────────────────
    if (id.startsWith('create_trade_'))   return interaction.showModal(buildTradeModal(interaction.user.id));
    if (id.startsWith('create_request_')) return interaction.showModal(buildRequestModal(interaction.user.id));

    // ── عرض عام ──────────────────────────────────
    if (id === 'view_all')      return showAllInteraction(interaction);
    if (id === 'view_requests') return handleViewRequestsInteraction(interaction);
    if (id === 'view_trades')   return handleViewTradesInteraction(interaction);

    // ── تقديم عرض على تريد ───────────────────────
    if (id.startsWith('make_offer_')) {
      const tradeId = id.replace('make_offer_', '');
      const trade   = activeTrades.get(tradeId);
      if (!trade)
        return interaction.reply({ content: '❌ التريد غير موجود!', ephemeral: true });
      if (trade.locked)
        return interaction.reply({ content: '❌ هذا التريد مغلق — اختار البائع عرضاً بالفعل!', ephemeral: true });
      if (interaction.user.id === trade.userId)
        return interaction.reply({ content: '❌ ما تقدر تقدم عرض على تريدك الخاص!', ephemeral: true });
      for (const [, o] of trade.offers) {
        if (o.userId === interaction.user.id)
          return interaction.reply({ content: '❌ قدمت عرض مسبقاً على هذا التريد!', ephemeral: true });
      }
      return interaction.showModal(buildOfferModal(tradeId, 'trade'));
    }

    // ── تقديم عرض على طلب ────────────────────────
    if (id.startsWith('fulfill_request_')) {
      const requestId = id.replace('fulfill_request_', '');
      const req       = activeRequests.get(requestId);
      if (!req)
        return interaction.reply({ content: '❌ الطلب غير موجود!', ephemeral: true });
      if (req.locked)
        return interaction.reply({ content: '❌ هذا الطلب مغلق!', ephemeral: true });
      if (interaction.user.id === req.userId)
        return interaction.reply({ content: '❌ ما تقدر تقدم عرض على طلبك الخاص!', ephemeral: true });
      for (const [, o] of req.offers) {
        if (o.userId === interaction.user.id)
          return interaction.reply({ content: '❌ قدمت عرض مسبقاً على هذا الطلب!', ephemeral: true });
      }
      return interaction.showModal(buildOfferModal(requestId, 'request'));
    }

    // ── عرض كل العروض لصاحب المنشور ─────────────
    if (id.startsWith('view_offers_')) {
      const withoutPrefix = id.replace('view_offers_', '');
      const pType  = withoutPrefix.startsWith('request_') ? 'request' : 'trade';
      const postId = withoutPrefix.replace(`${pType}_`, '');
      const post   = pType === 'trade' ? activeTrades.get(postId) : activeRequests.get(postId);
      if (!post)
        return interaction.reply({ content: '❌ المنشور غير موجود!', ephemeral: true });
      if (interaction.user.id !== post.userId)
        return interaction.reply({ content: '❌ فقط صاحب المنشور يقدر يشوف العروض!', ephemeral: true });
      return showOffersToOwner(interaction, post, postId, pType);
    }

    // ── قبول عرض معين ────────────────────────────
    if (id.startsWith('accept_offer_')) {
      const parts   = id.replace('accept_offer_', '').split('__');
      const postId  = parts[0];
      const offerId = parts[1];
      const pType   = parts[2];
      const post    = pType === 'trade' ? activeTrades.get(postId) : activeRequests.get(postId);

      if (!post)
        return interaction.reply({ content: '❌ المنشور غير موجود!', ephemeral: true });
      if (interaction.user.id !== post.userId)
        return interaction.reply({ content: '❌ فقط صاحب المنشور يقبل العروض!', ephemeral: true });
      if (post.locked)
        return interaction.reply({ content: '❌ قبلت عرضاً بالفعل!', ephemeral: true });

      const offer = post.offers.get(offerId);
      if (!offer)
        return interaction.reply({ content: '❌ العرض غير موجود!', ephemeral: true });

      // قفل المنشور
      post.locked = true;
      if (pType === 'trade') activeTrades.set(postId, post);
      else activeRequests.set(postId, post);

      await interaction.reply({ embeds: [
        new EmbedBuilder().setColor('#00FF7F')
          .setTitle('✅ قبلت العرض!')
          .setDescription(`تم قبول عرض **${offer.username}**!\nجاري فتح تيكيت الوسيط...`)
          .setTimestamp()
      ], ephemeral: true });

      // DM للمقدّم بأن عرضه انقبل
      try {
        const offerer = await client.users.fetch(offer.userId);
        await offerer.send({ embeds: [
          new EmbedBuilder().setColor('#00FF7F')
            .setTitle('🎉 عرضك انقبل!')
            .setDescription(`**${post.username}** قبل عرضك!`)
            .addFields(
              { name: pType === 'trade' ? '🎁 التريد' : '🎯 الطلب', value: pType === 'trade' ? post.offerItem : post.wantItem, inline: true },
              { name: '🔄 عرضك',              value: offer.item,    inline: true  },
              { name: '📌 الخطوة التالية',    value: 'تم فتح تيكيت وسيط داخل السيرفر 🔒', inline: false }
            ).setTimestamp()
        ]});
      } catch {}

      // بناء بيانات التيكيت بحسب النوع
      const ticketPayload = pType === 'trade' ? {
        sellerId:       post.userId,  sellerName:    post.username,
        buyerId:        offer.userId, buyerName:     offer.username,
        offerItem:      post.offerItem,   wantItem:  post.wantItem,
        income:         post.income,      upgrades:  post.upgrades,
        notes:          post.notes,
        sellerImageUrl: post.imageUrl,
        buyerItem:      offer.item,       buyerIncome:   offer.income,
        buyerUpgrades:  offer.upgrades,   buyerNotes:    offer.notes,
        buyerImageUrl:  offer.imageUrl,
      } : {
        requesterId:    post.userId,  requesterName:  post.username,
        supplierId:     offer.userId, supplierName:   offer.username,
        wantItem:       post.wantItem,    wantDetails: post.wantDetails,
        offerItem:      post.offerItem,   offerIncome: post.offerIncome,
        requestImageUrl: post.imageUrl,
        supplierItem:    offer.item,      supplierIncome:   offer.income,
        supplierUpgrades: offer.upgrades, supplierNotes:    offer.notes,
        supplierImageUrl: offer.imageUrl,
      };

      return createMiddlemanTicket(interaction, ticketPayload, postId, pType);
    }

    // ── رفض عرض معين ─────────────────────────────
    if (id.startsWith('reject_offer_')) {
      const parts   = id.replace('reject_offer_', '').split('__');
      const postId  = parts[0];
      const offerId = parts[1];
      const pType   = parts[2];
      const post    = pType === 'trade' ? activeTrades.get(postId) : activeRequests.get(postId);

      if (!post || interaction.user.id !== post.userId)
        return interaction.reply({ content: '❌ غير مصرح!', ephemeral: true });

      const offer = post.offers.get(offerId);
      if (!offer)
        return interaction.reply({ content: '❌ العرض غير موجود!', ephemeral: true });

      post.offers.delete(offerId);
      if (pType === 'trade') activeTrades.set(postId, post);
      else activeRequests.set(postId, post);

      // DM للمرفوض
      try {
        const offerer = await client.users.fetch(offer.userId);
        await offerer.send({ embeds: [
          new EmbedBuilder().setColor('#FF6B35')
            .setTitle('❌ عرضك انرفض')
            .setDescription(`رفض **${post.username}** عرضك هذه المرة.\nلا تيأس، يمكنك تقديم عروض على تريدات أخرى!`)
            .addFields({ name: '🔄 عرضك كان', value: offer.item, inline: true })
            .setTimestamp()
        ]});
      } catch {}

      return interaction.reply({ content: `✅ تم رفض عرض **${offer.username}** وإشعاره.`, ephemeral: true });
    }

    // ── حذف التريد ───────────────────────────────
    if (id.startsWith('delete_trade_')) {
      const tradeId = id.replace('delete_trade_', '');
      const trade   = activeTrades.get(tradeId);
      if (!trade)
        return interaction.reply({ content: '❌ التريد مو موجود!', ephemeral: true });
      if (interaction.user.id !== trade.userId)
        return interaction.reply({ content: '❌ هذا مو تريدك!', ephemeral: true });
      activeTrades.delete(tradeId);
      return interaction.update({ embeds: [
        new EmbedBuilder().setColor('#FF0000')
          .setTitle('🗑️ تم حذف التريد')
          .setDescription('حذف صاحبه هذا التريد.')
          .setTimestamp()
      ], components: [] });
    }

    // ── حذف الطلب ────────────────────────────────
    if (id.startsWith('delete_request_')) {
      const requestId = id.replace('delete_request_', '');
      const req       = activeRequests.get(requestId);
      if (!req)
        return interaction.reply({ content: '❌ الطلب مو موجود!', ephemeral: true });
      if (interaction.user.id !== req.userId)
        return interaction.reply({ content: '❌ هذا مو طلبك!', ephemeral: true });
      activeRequests.delete(requestId);
      return interaction.update({ embeds: [
        new EmbedBuilder().setColor('#FF0000')
          .setTitle('🗑️ تم حذف الطلب')
          .setDescription('حذف صاحبه هذا الطلب.')
          .setTimestamp()
      ], components: [] });
    }

    // ── أزرار الوسيط ─────────────────────────────
    if (id.startsWith('complete_trade_')) {
      const td = activeTickets.get(interaction.channel.id);
      if (!td) return interaction.reply({ content: '❌ ما لقيت بيانات التيكيت!', ephemeral: true });
      const m = await interaction.guild.members.fetch(interaction.user.id);
      if (!m.roles.cache.has(MM_ROLE_ID))
        return interaction.reply({ content: '❌ هذا الزر للوسطاء فقط!', ephemeral: true });
      return completeTradeTicket(interaction, td);
    }

    if (id.startsWith('cancel_trade_')) {
      const td = activeTickets.get(interaction.channel.id);
      if (!td) return interaction.reply({ content: '❌ ما لقيت بيانات التيكيت!', ephemeral: true });
      const m = await interaction.guild.members.fetch(interaction.user.id);
      if (!m.roles.cache.has(MM_ROLE_ID))
        return interaction.reply({ content: '❌ هذا الزر للوسطاء فقط!', ephemeral: true });
      return cancelTradeTicket(interaction, td);
    }

    if (id.startsWith('close_ticket_')) {
      const m = await interaction.guild.members.fetch(interaction.user.id);
      if (!m.permissions.has(PermissionFlagsBits.ManageChannels) && !m.roles.cache.has(MM_ROLE_ID))
        return interaction.reply({ content: '❌ ما عندك صلاحية إغلاق التيكيت!', ephemeral: true });
      await interaction.reply({ content: '🔒 سيتم الإغلاق خلال 5 ثواني...' });
      setTimeout(async () => {
        try { await interaction.channel.delete(); } catch {}
        activeTickets.delete(interaction.channel.id);
      }, 5000);
    }
  }

  // ──────────────────────────────────────────────────
  //  📝 Modal Submits
  // ──────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {

    // ── إنشاء تريد ──────────────────────────────
    if (interaction.customId.startsWith('trade_submit_')) {
      const tradeId = `T-${interaction.user.id}-${Date.now()}`;
      activeTrades.set(tradeId, {
        userId:    interaction.user.id,
        username:  interaction.user.username,
        userAvatar: interaction.user.displayAvatarURL({ dynamic: true }),
        offerItem:  interaction.fields.getTextInputValue('offer_item'),
        wantItem:   interaction.fields.getTextInputValue('want_item'),
        income:     interaction.fields.getTextInputValue('income'),
        upgrades:   interaction.fields.getTextInputValue('upgrades'),
        notes:      interaction.fields.getTextInputValue('notes') || 'لا يوجد',
        imageUrl:   null,
        locked:     false,
        offers:     new Map(),
        channelId:  interaction.channel.id,
        timestamp:  new Date()
      });

      pendingImageUploads.set(interaction.user.id, {
        tradeId, step: 'seller_image', channelId: interaction.channel.id
      });

      return interaction.reply({
        embeds: [imgRequestEmbed('📸 أرسل صورة الـ Brainrot الذي تعرضه')],
        ephemeral: true
      });
    }

    // ── إنشاء طلب ───────────────────────────────
    if (interaction.customId.startsWith('request_submit_')) {
      const requestId = `R-${interaction.user.id}-${Date.now()}`;
      activeRequests.set(requestId, {
        userId:    interaction.user.id,
        username:  interaction.user.username,
        userAvatar: interaction.user.displayAvatarURL({ dynamic: true }),
        wantItem:    interaction.fields.getTextInputValue('want_item'),
        wantDetails: interaction.fields.getTextInputValue('want_details'),
        offerItem:   interaction.fields.getTextInputValue('offer_item'),
        offerIncome: interaction.fields.getTextInputValue('offer_income'),
        notes:       interaction.fields.getTextInputValue('notes') || 'لا يوجد',
        imageUrl:    null,
        locked:      false,
        offers:      new Map(),
        channelId:   interaction.channel.id,
        timestamp:   new Date()
      });

      pendingImageUploads.set(interaction.user.id, {
        requestId, step: 'request_image', channelId: interaction.channel.id
      });

      return interaction.reply({
        embeds: [imgRequestEmbed('📸 أرسل صورة الشي الذي تطلبه')],
        ephemeral: true
      });
    }

    // ── تقديم عرض على تريد أو طلب ───────────────
    if (interaction.customId.startsWith('offer_submit_')) {
      const rest   = interaction.customId.replace('offer_submit_', '');
      const pType  = rest.startsWith('request_') ? 'request' : 'trade';
      const postId = rest.replace(`${pType}_`, '');
      const post   = pType === 'trade' ? activeTrades.get(postId) : activeRequests.get(postId);

      if (!post || post.locked)
        return interaction.reply({ content: '❌ المنشور غير متاح!', ephemeral: true });

      const offerId   = `O-${interaction.user.id}-${Date.now()}`;
      const offerData = {
        offerId,
        userId:    interaction.user.id,
        username:  interaction.user.username,
        userAvatar: interaction.user.displayAvatarURL({ dynamic: true }),
        item:      interaction.fields.getTextInputValue('offer_item'),
        income:    interaction.fields.getTextInputValue('offer_income'),
        upgrades:  interaction.fields.getTextInputValue('offer_upgrades'),
        notes:     interaction.fields.getTextInputValue('offer_notes') || 'لا يوجد',
        imageUrl:  null,
        postId, postType: pType,
        timestamp: new Date()
      };

      post.offers.set(offerId, offerData);
      if (pType === 'trade') activeTrades.set(postId, post);
      else activeRequests.set(postId, post);

      pendingImageUploads.set(interaction.user.id, {
        step: 'offer_image', offerId, postId, postType: pType,
        channelId: interaction.channel.id
      });

      return interaction.reply({
        embeds: [imgRequestEmbed('📸 أرسل صورة الشي الذي تعرضه')],
        ephemeral: true
      });
    }
  }
});

// ══════════════════════════════════════════════════════
//  📷  معالجة الصور
// ══════════════════════════════════════════════════════

// صورة البائع عند إنشاء تريد جديد
async function handleSellerImageUpload(message, p) {
  const trade = activeTrades.get(p.tradeId);
  if (!trade) { pendingImageUploads.delete(message.author.id); return; }
  const img = await extractImage(message);
  if (img === false) return;
  
  trade.imageUrl = img;
  activeTrades.set(p.tradeId, trade);
  pendingImageUploads.delete(message.author.id);
  await publishTrade(message, trade, p.tradeId);
}

// صورة صاحب الطلب عند إنشاء طلب جديد
async function handleRequestImageUpload(message, p) {
  const req = activeRequests.get(p.requestId);
  if (!req) { pendingImageUploads.delete(message.author.id); return; }
  const img = await extractImage(message);
  if (img === false) return;
  
  req.imageUrl = img;
  activeRequests.set(p.requestId, req);
  pendingImageUploads.delete(message.author.id);
  await publishRequest(message, req, p.requestId);
}

// صورة مقدّم العرض (على تريد أو طلب)
async function handleOfferImageUpload(message, p) {
  const post  = p.postType === 'trade' ? activeTrades.get(p.postId) : activeRequests.get(p.postId);
  if (!post)  { pendingImageUploads.delete(message.author.id); return; }
  const offer = post.offers.get(p.offerId);
  if (!offer) { pendingImageUploads.delete(message.author.id); return; }

  const img = await extractImage(message);
  if (img === false) return;

  

  offer.imageUrl = img;
  post.offers.set(p.offerId, offer);
  if (p.postType === 'trade') activeTrades.set(p.postId, post);
  else activeRequests.set(p.postId, post);
  pendingImageUploads.delete(message.author.id);

  // ── إشعار المقدّم عبر DM بدل reply (ما يشوفه الناس) ──
  try {
    const me = await client.users.fetch(message.author.id);
    await me.send({ embeds: [
      new EmbedBuilder().setColor('#00FF7F')
        .setTitle('✅ تم تقديم عرضك بنجاح!')
        .setDescription(`أُرسل عرضك إلى **${post.username}**!\nستصلك رسالة خاصة عندما يرد عليك.`)
        .addFields(
          { name: '🔄 عرضك',       value: offer.item,     inline: true },
          { name: '💵 دخله/ثانية', value: offer.income,   inline: true },
          { name: '⬆️ تطويراته',   value: offer.upgrades, inline: true }
        ).setTimestamp()
    ]});
  } catch {}

  // ── DM لصاحب المنشور ──
  try {
    const owner       = await client.users.fetch(post.userId);
    const totalOffers = post.offers.size;
    const dm = new EmbedBuilder()
      .setColor('#FFD700')
      .setAuthor({ name: `💬 عرض جديد من ${offer.username}!`, iconURL: offer.userAvatar })
      .setTitle(p.postType === 'trade'
        ? `وصلك عرض جديد على تريدك — ${post.offerItem}`
        : `وصلك عرض جديد على طلبك — ${post.wantItem}`)
      .addFields(
        { name: '🔄 يعرض',            value: `\`${offer.item}\``,  inline: true  },
        { name: '💵 دخله/ثانية',     value: offer.income,          inline: true  },
        { name: '⬆️ تطويراته',       value: offer.upgrades,        inline: false },
        { name: '📝 ملاحظاته',        value: offer.notes,           inline: false },
        { name: '📊 إجمالي العروض',   value: `${totalOffers} عرض على منشورك`, inline: false },
        { name: '📌 كيف تشوف الكل؟', value: 'اضغط **"👁️ عروضي"** في منشورك لعرض كل العروض والقبول أو الرفض', inline: false }
      ).setTimestamp();
    if (offer.imageUrl) dm.setThumbnail(offer.imageUrl);
    await owner.send({ embeds: [dm] });
  } catch {}
}

// للتوافق مع المسار القديم
async function handleSupplierImageUpload(message, p) {
  await handleOfferImageUpload(message, {
    ...p, step: 'offer_image',
    offerId: p.offerId, postId: p.requestId, postType: 'request'
  });
}

// ══════════════════════════════════════════════════════
//  📢  نشر التريد في قناة التريدات
// ══════════════════════════════════════════════════════
async function publishTrade(message, trade, tradeId) {
  const embed = new EmbedBuilder()
    .setColor('#FF6B35')
    .setAuthor({ name: `${trade.username} يعرض تريد!`, iconURL: trade.userAvatar })
    .setTitle('🔄 عرض تريد جديد — Steal a Brainrot')
    .addFields(
      { name: '╔══════════════════════╗', value: '_ _',             inline: false },
      { name: '🎁 __الشي المعروض__',    value: `> \`\`\`${trade.offerItem}\`\`\``, inline: false },
      { name: '⬆️ __التطويرات__',       value: `> 🔧 ${trade.upgrades}`,           inline: true  },
      { name: '💵 __الدخل/ثانية__',    value: `> 💰 ${trade.income}`,             inline: true  },
      { name: '_ _', value: '━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
      { name: '💰 __يبي مقابله__',      value: `> \`\`\`${trade.wantItem}\`\`\``, inline: false },
      { name: '_ _', value: '━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
      { name: '📝 __ملاحظات__',         value: `> ${trade.notes}`,                inline: false },
      { name: '╚══════════════════════╝', value: '_ _',             inline: false },
      { name: '👤 __صاحب التريد__', value: `<@${trade.userId}>`,      inline: true },
      { name: '🆔 __Trade ID__',    value: `\`${tradeId.slice(-6)}\``, inline: true },
      { name: '📊 __الحالة__',      value: '🟢 يقبل عروض',            inline: true }
    )
    .setFooter({ text: '💬 عندك شي غير اللي يبيه؟ اضغط "تقديم عرض"!', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (trade.imageUrl) embed.setImage(trade.imageUrl);

  const ch = client.channels.cache.get(TRADE_CHANNEL_ID);
  if (ch) await ch.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      mkBtn(`make_offer_${tradeId}`,        '💬 تقديم عرض', ButtonStyle.Primary),
      mkBtn(`view_offers_trade_${tradeId}`, '👁️ عروضي',     ButtonStyle.Secondary),
      mkBtn(`delete_trade_${tradeId}`,      '🗑️ حذف',       ButtonStyle.Danger)
    )]
  });

  // ── إشعار البائع عبر DM ──
  const confirmEmbed = new EmbedBuilder().setColor('#00FF7F').setTitle('✅ تم نشر تريدك!')
    .setDescription(
      `نُشر تريدك في <#${TRADE_CHANNEL_ID}> بنجاح! 🎉\n` +
      `الناس يقدرون يحطون عروض وأنت تختار الأنسب.\n` +
      `ستوصلك رسالة خاصة مع كل عرض جديد.`
    )
    .addFields(
      { name: '🎁 عرضك',  value: trade.offerItem,                            inline: true },
      { name: '💰 مقابل', value: trade.wantItem,                              inline: true },
      { name: '🖼️ صورة', value: trade.imageUrl ? '✅ مرفقة' : '❌ بدون صورة', inline: true }
    ).setTimestamp();

  let dmSent = false;
  try {
    const owner = await client.users.fetch(trade.userId);
    await owner.send({ embeds: [confirmEmbed] });
    dmSent = true;
  } catch {}

  // إذا ما وصل الـ DM، أرسل في القناة وتحذف بعد 8 ثواني
  if (!dmSent) {
    try {
      const fallback = await message.channel.send({
        content: `<@${trade.userId}>`,
        embeds: [confirmEmbed]
      });
      setTimeout(() => fallback.delete().catch(() => {}), 8000);
    } catch {}
  }
}

// ══════════════════════════════════════════════════════
//  📢  نشر الطلب في قناة الطلبات
// ══════════════════════════════════════════════════════
async function publishRequest(message, req, requestId) {
  const embed = new EmbedBuilder()
    .setColor('#00B4D8')
    .setAuthor({ name: `${req.username} يطلب شي!`, iconURL: req.userAvatar })
    .setTitle('🛒 طلب شي — Steal a Brainrot')
    .addFields(
      { name: '╔══════════════════════╗', value: '_ _',              inline: false },
      { name: '🎯 __الشي المطلوب__',    value: `> \`\`\`${req.wantItem}\`\`\``,  inline: false },
      { name: '📋 __تفاصيل الطلب__',   value: `> ${req.wantDetails}`,             inline: false },
      { name: '_ _', value: '━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
      { name: '🎁 __عنده مقابله__',    value: `> \`\`\`${req.offerItem}\`\`\``,  inline: false },
      { name: '💵 __دخله/ثانية__',     value: `> 💰 ${req.offerIncome}`,          inline: true  },
      { name: '_ _', value: '━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
      { name: '📝 __ملاحظات__',         value: `> ${req.notes}`,                  inline: false },
      { name: '╚══════════════════════╝', value: '_ _',              inline: false },
      { name: '👤 __صاحب الطلب__',  value: `<@${req.userId}>`,          inline: true },
      { name: '🆔 __Request ID__',   value: `\`${requestId.slice(-6)}\``, inline: true },
      { name: '📊 __الحالة__',       value: '🟢 يقبل عروض',              inline: true }
    )
    .setFooter({ text: '🙋 عندك الشي؟ اضغط "تقديم عرض"!', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (req.imageUrl) embed.setImage(req.imageUrl);

  const ch = client.channels.cache.get(REQUEST_CHANNEL_ID);
  if (ch) await ch.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      mkBtn(`fulfill_request_${requestId}`,        '💬 تقديم عرض', ButtonStyle.Success),
      mkBtn(`view_offers_request_${requestId}`,    '👁️ عروضي',     ButtonStyle.Secondary),
      mkBtn(`delete_request_${requestId}`,         '🗑️ حذف',       ButtonStyle.Danger)
    )]
  });

  // ── إشعار صاحب الطلب عبر DM مع fallback ──
  const reqConfirmEmbed = new EmbedBuilder().setColor('#00B4D8').setTitle('✅ تم نشر طلبك!')
    .setDescription(
      `نُشر طلبك في <#${REQUEST_CHANNEL_ID}> بنجاح! 🎉\n` +
      `الناس يقدرون يعرضون ما عندهم وأنت تختار الأنسب.\n` +
      `ستوصلك رسالة خاصة مع كل عرض جديد.`
    )
    .addFields(
      { name: '🎯 طلبك',   value: req.wantItem,                               inline: true },
      { name: '🎁 مقابله', value: req.offerItem,                               inline: true },
      { name: '🖼️ صورة',  value: req.imageUrl ? '✅ مرفقة' : '❌ بدون صورة', inline: true }
    ).setTimestamp();

  let reqDmSent = false;
  try {
    const owner = await client.users.fetch(req.userId);
    await owner.send({ embeds: [reqConfirmEmbed] });
    reqDmSent = true;
  } catch {}

  if (!reqDmSent) {
    try {
      const fallback = await message.channel.send({
        content: `<@${req.userId}>`,
        embeds: [reqConfirmEmbed]
      });
      setTimeout(() => fallback.delete().catch(() => {}), 8000);
    } catch {}
  }
}

// ══════════════════════════════════════════════════════
//  👁️  عرض العروض لصاحب المنشور
// ══════════════════════════════════════════════════════
async function showOffersToOwner(interaction, post, postId, pType) {
  if (post.offers.size === 0) {
    return interaction.reply({ embeds: [
      new EmbedBuilder().setColor('#FFA500')
        .setTitle('📭 ما في عروض بعد')
        .setDescription('لم يصلك أي عرض حتى الآن. انتظر قليلاً!')
        .setTimestamp()
    ], ephemeral: true });
  }

  const embeds = [];
  const rows   = [];
  let i = 0;

  for (const [offerId, offer] of post.offers) {
    if (i >= 5) break; // ديسكورد يسمح بـ 5 action rows

    const offerEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: `عرض ${i + 1} من ${offer.username}`, iconURL: offer.userAvatar })
      .addFields(
        { name: '🔄 يعرض',        value: `\`${offer.item}\``, inline: true  },
        { name: '💵 دخله/ثانية', value: offer.income,         inline: true  },
        { name: '⬆️ تطويراته',   value: offer.upgrades,       inline: true  },
        { name: '📝 ملاحظاته',    value: offer.notes,          inline: false }
      )
      .setTimestamp(offer.timestamp);

    if (offer.imageUrl) offerEmbed.setThumbnail(offer.imageUrl);
    embeds.push(offerEmbed);

    rows.push(new ActionRowBuilder().addComponents(
      mkBtn(`accept_offer_${postId}__${offerId}__${pType}`, `✅ قبول عرض ${i + 1}`, ButtonStyle.Success),
      mkBtn(`reject_offer_${postId}__${offerId}__${pType}`, `❌ رفض عرض ${i + 1}`,  ButtonStyle.Danger)
    ));
    i++;
  }

  const header = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(`📬 العروض على ${pType === 'trade' ? 'تريدك' : 'طلبك'} — ${post.offers.size} عرض`)
    .setDescription(
      'اضغط **✅ قبول** على العرض اللي يناسبك، أو **❌ رفض** للتخلص منه.\n' +
      '> التريد يبقى مفتوح حتى تقبل عرضاً واحداً.'
    )
    .setTimestamp();

  await interaction.reply({ embeds: [header, ...embeds], components: rows, ephemeral: true });
}

// ══════════════════════════════════════════════════════
//  ⚖️  إنشاء تيكيت الوسيط
// ══════════════════════════════════════════════════════
async function createMiddlemanTicket(source, data, postId, type) {
  const guild   = source.guild;
  const isTrade = type === 'trade';

  const partyA     = isTrade ? data.sellerId    : data.requesterId;
  const partyB     = isTrade ? data.buyerId     : data.supplierId;
  const partyAName = isTrade ? data.sellerName  : data.requesterName;
  const partyBName = isTrade ? data.buyerName   : data.supplierName;

  const channelName = `${isTrade ? 'تريد' : 'طلب'}-${partyAName}-${partyBName}`
    .slice(0, 90).replace(/\s+/g, '-').replace(/[^\u0600-\u06FFa-z0-9\-]/gi, '');

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: MM_CATEGORY_ID || null,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny:  [PermissionFlagsBits.ViewChannel] },
        { id: partyA,                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: partyB,                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: MM_ROLE_ID,              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        { id: client.user.id,          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
      ]
    });
  } catch (err) {
    console.error('❌ خطأ في إنشاء التيكيت:', err);
    try { await source.channel.send('❌ ما قدرت أنشئ تيكيت! تأكد صلاحيات البوت.'); } catch {}
    return;
  }

  activeTickets.set(ticketChannel.id, { ...data, type, postId, status: 'pending' });

  // ──── Embed التيكيت الاحترافي ────
  const ticketEmbed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(`⚖️ تيكيت وسيط — ${isTrade ? 'تريد' : 'طلب'} Steal a Brainrot`)
    .setDescription(`<@&${MM_ROLE_ID}> سيشرف على العملية كاملة.\n\u200b`)
    .addFields(
      { name: '╔══════════════════════╗', value: '_ _', inline: false },
      { name: isTrade ? '🧑‍💼 __البائع__'  : '🛒 __الطالب__',  value: `<@${partyA}>`, inline: true },
      { name: isTrade ? '🛒 __المشتري__' : '🎁 __المورّد__', value: `<@${partyB}>`, inline: true },
      { name: '_ _', value: '━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
      {
        name: isTrade ? '🎁 __عرض البائع__' : '🎯 __الشي المطلوب__',
        value: `\`\`\`${isTrade ? data.offerItem : data.wantItem}\`\`\``,
        inline: false
      },
      ...(isTrade
        ? [
            { name: '⬆️ تطويراته', value: data.upgrades, inline: true },
            { name: '💵 دخله',     value: data.income,   inline: true },
            { name: '📝 ملاحظاته', value: data.notes || 'لا يوجد', inline: false },
          ]
        : [
            { name: '🎁 مقابله',   value: data.offerItem,   inline: true },
            { name: '💵 دخله',     value: data.offerIncome, inline: true },
          ]
      ),
      { name: '_ _', value: '━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
      {
        name: isTrade ? '🔄 __عرض المشتري__' : '🎁 __عرض المورّد__',
        value: `\`\`\`${isTrade ? data.buyerItem : data.supplierItem}\`\`\``,
        inline: false
      },
      { name: '⬆️ تطويراته', value: isTrade ? data.buyerUpgrades    : data.supplierUpgrades,  inline: true  },
      { name: '💵 دخله',     value: isTrade ? data.buyerIncome      : data.supplierIncome,    inline: true  },
      { name: '📝 ملاحظاته', value: isTrade ? (data.buyerNotes || 'لا يوجد') : (data.supplierNotes || 'لا يوجد'), inline: false },
      { name: '╚══════════════════════╝', value: '_ _', inline: false },
      {
        name: '📋 __خطوات إتمام العملية__',
        value:
          '1️⃣ الوسيط يتحقق من الطرفين والصور\n' +
          '2️⃣ الطرف الأول يسلّم شيئه للوسيط\n' +
          '3️⃣ الطرف الثاني يسلّم شيئه للوسيط\n' +
          '4️⃣ الوسيط يوزّع ويضغط ✅ تمت العملية',
        inline: false
      }
    )
    .setFooter({ text: `ID: ${postId.slice(-6)} • جميع العمليات داخل السيرفر فقط 🔒`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  await ticketChannel.send({
    content: `📣 <@${partyA}> <@${partyB}> <@&${MM_ROLE_ID}>`,
    embeds: [ticketEmbed],
    components: [new ActionRowBuilder().addComponents(
      mkBtn(`complete_trade_${postId}`, '✅ تمت العملية', ButtonStyle.Success),
      mkBtn(`cancel_trade_${postId}`,   '❌ إلغاء',       ButtonStyle.Danger),
      mkBtn(`close_ticket_${postId}`,   '🔒 إغلاق',       ButtonStyle.Secondary)
    )]
  });

  // إرسال الصور منفصلة إن وُجدت
  const imgs  = [];
  const imgA  = isTrade ? data.sellerImageUrl   : data.requestImageUrl;
  const imgB  = isTrade ? data.buyerImageUrl     : data.supplierImageUrl;
  const lblA  = isTrade ? `📷 صورة البائع — ${data.offerItem}`    : `📷 صورة الطلب — ${data.wantItem}`;
  const lblB  = isTrade ? `📷 صورة المشتري — ${data.buyerItem}`   : `📷 صورة المورّد — ${data.supplierItem}`;

  if (imgA) imgs.push(new EmbedBuilder().setColor('#FF6B35').setTitle(lblA).setImage(imgA));
  if (imgB) imgs.push(new EmbedBuilder().setColor('#00B4D8').setTitle(lblB).setImage(imgB));
  if (imgs.length) await ticketChannel.send({ embeds: imgs });
}

// ══════════════════════════════════════════════════════
//  ✅  إتمام العملية
// ══════════════════════════════════════════════════════
async function completeTradeTicket(interaction, td) {
  td.status = 'completed';
  const isTrade = td.type === 'trade';
  const pA = isTrade ? td.sellerId    : td.requesterId;
  const pB = isTrade ? td.buyerId     : td.supplierId;
  const nA = isTrade ? td.sellerName  : td.requesterName;
  const nB = isTrade ? td.buyerName   : td.supplierName;

  await interaction.reply({ embeds: [
    new EmbedBuilder().setColor('#00FF7F')
      .setTitle('🎉 تمت العملية بنجاح!')
      .setDescription(`أكد الوسيط **${interaction.user.username}** إتمام العملية!`)
      .addFields(
        { name: isTrade ? '🧑‍💼 البائع'  : '🛒 الطالب',  value: `<@${pA}>`, inline: true },
        { name: isTrade ? '🛒 المشتري' : '🎁 المورّد', value: `<@${pB}>`, inline: true },
        { name: '🎁 الشي', value: isTrade ? td.offerItem : td.wantItem, inline: false }
      )
      .setFooter({ text: `أشرف عليه: ${interaction.user.username}` })
      .setTimestamp()
  ]});

  // DM للطرفين بعد الإتمام
  for (const [uid, other] of [[pA, nB], [pB, nA]]) {
    try {
      const u = await client.users.fetch(uid);
      await u.send({ embeds: [
        new EmbedBuilder().setColor('#00FF7F')
          .setTitle('✅ عمليتك اكتملت بنجاح!')
          .setDescription('تم التأكيد من الوسيط. شكراً لاستخدامك نظام التريد الآمن! 🎉')
          .addFields(
            { name: '🎁 الشي',        value: isTrade ? td.offerItem : td.wantItem, inline: true  },
            { name: '⚖️ الوسيط',     value: interaction.user.username,             inline: false },
            { name: '👤 الطرف الآخر', value: other,                                inline: false }
          ).setTimestamp()
      ]});
    } catch {}
  }

  await interaction.channel.send('🔒 سيُغلق هذا التيكيت تلقائياً خلال **10 ثواني**...');
  setTimeout(async () => {
    try { await interaction.channel.delete(); } catch {}
    activeTickets.delete(interaction.channel.id);
    if (isTrade) activeTrades.delete(td.postId);
    else activeRequests.delete(td.postId);
  }, 10000);
}

// ══════════════════════════════════════════════════════
//  ❌  إلغاء العملية
// ══════════════════════════════════════════════════════
async function cancelTradeTicket(interaction, td) {
  td.status = 'cancelled';
  const isTrade = td.type === 'trade';
  const pA = isTrade ? td.sellerId    : td.requesterId;
  const pB = isTrade ? td.buyerId     : td.supplierId;

  await interaction.reply({ embeds: [
    new EmbedBuilder().setColor('#FF0000')
      .setTitle('❌ تم إلغاء العملية')
      .setDescription(`ألغى الوسيط **${interaction.user.username}** هذه العملية.`)
      .addFields(
        { name: isTrade ? '🧑‍💼 البائع'  : '🛒 الطالب',  value: `<@${pA}>`, inline: true },
        { name: isTrade ? '🛒 المشتري' : '🎁 المورّد', value: `<@${pB}>`, inline: true }
      ).setTimestamp()
  ]});

  // DM للطرفين عند الإلغاء
  for (const uid of [pA, pB]) {
    try {
      const u = await client.users.fetch(uid);
      await u.send({ embeds: [
        new EmbedBuilder().setColor('#FF0000')
          .setTitle('❌ تم إلغاء عمليتك')
          .setDescription('قرر الوسيط إلغاء العملية. تواصل مع إدارة السيرفر إذا عندك مشكلة.')
          .setTimestamp()
      ]});
    } catch {}
  }

  await interaction.channel.send('🔒 سيُغلق هذا التيكيت تلقائياً خلال **10 ثواني**...');
  setTimeout(async () => {
    try { await interaction.channel.delete(); } catch {}
    activeTickets.delete(interaction.channel.id);
    if (isTrade) activeTrades.delete(td.postId);
    else activeRequests.delete(td.postId);
  }, 10000);
}

// ══════════════════════════════════════════════════════
//  📋  عرض التريدات والطلبات
// ══════════════════════════════════════════════════════
async function handleViewTrades(message) {
  if (!activeTrades.size) return message.channel.send({ embeds: [
    new EmbedBuilder().setColor('#FFA500')
      .setTitle('📋 التريدات النشطة')
      .setDescription('❌ ما في تريدات حالياً!\nاستخدم `!تريد` لإنشاء تريد جديد.')
      .setTimestamp()
  ]});

  const embed = new EmbedBuilder().setColor('#FF6B35')
    .setTitle('📋 التريدات النشطة — Steal a Brainrot')
    .setDescription(`**${activeTrades.size}** تريد نشط`)
    .setTimestamp()
    .setFooter({ text: 'استخدم !تريد لإنشاء تريد جديد' });

  let i = 0;
  for (const [, t] of activeTrades) {
    if (i++ >= 10) break;
    embed.addFields({
      name: `${i}. ${t.offerItem} ${t.locked ? '🔴 مغلق' : '🟢 يقبل عروض'}${t.imageUrl ? ' 🖼️' : ''}`,
      value: `👤 <@${t.userId}> | 💰 يبي: ${t.wantItem} | 💵 ${t.income}/sec | 💬 ${t.offers.size} عرض`,
      inline: false
    });
  }
  await message.channel.send({ embeds: [embed] });
}

async function handleViewRequests(message) {
  if (!activeRequests.size) return message.channel.send({ embeds: [
    new EmbedBuilder().setColor('#FFA500')
      .setTitle('🛒 الطلبات النشطة')
      .setDescription('❌ ما في طلبات حالياً!\nاستخدم `!طلب` لإنشاء طلب جديد.')
      .setTimestamp()
  ]});

  const embed = new EmbedBuilder().setColor('#00B4D8')
    .setTitle('🛒 الطلبات النشطة — Steal a Brainrot')
    .setDescription(`**${activeRequests.size}** طلب نشط`)
    .setTimestamp()
    .setFooter({ text: 'استخدم !طلب لإنشاء طلب جديد' });

  let i = 0;
  for (const [, r] of activeRequests) {
    if (i++ >= 10) break;
    embed.addFields({
      name: `${i}. يطلب: ${r.wantItem} ${r.locked ? '🔴 مغلق' : '🟢 يقبل عروض'}${r.imageUrl ? ' 🖼️' : ''}`,
      value: `👤 <@${r.userId}> | 🎁 مقابله: ${r.offerItem} | 💵 ${r.offerIncome}/sec | 💬 ${r.offers.size} عرض`,
      inline: false
    });
  }
  await message.channel.send({ embeds: [embed] });
}

async function handleViewTradesInteraction(interaction) {
  if (!activeTrades.size) return interaction.reply({ embeds: [
    new EmbedBuilder().setColor('#FFA500')
      .setTitle('📋 التريدات النشطة').setDescription('❌ ما في تريدات!').setTimestamp()
  ], ephemeral: true });

  const embed = new EmbedBuilder().setColor('#FF6B35').setTitle('📋 التريدات النشطة').setTimestamp();
  let i = 0;
  for (const [, t] of activeTrades) {
    if (i++ >= 5) break;
    embed.addFields({
      name: `${t.offerItem} ${t.locked ? '🔴' : '🟢'}${t.imageUrl ? ' 🖼️' : ''}`,
      value: `👤 <@${t.userId}>\n💰 يبي: \`${t.wantItem}\`\n💵 ${t.income}/sec\n💬 ${t.offers.size} عرض`,
      inline: true
    });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleViewRequestsInteraction(interaction) {
  if (!activeRequests.size) return interaction.reply({ embeds: [
    new EmbedBuilder().setColor('#FFA500')
      .setTitle('🛒 الطلبات النشطة').setDescription('❌ ما في طلبات!').setTimestamp()
  ], ephemeral: true });

  const embed = new EmbedBuilder().setColor('#00B4D8').setTitle('🛒 الطلبات النشطة').setTimestamp();
  let i = 0;
  for (const [, r] of activeRequests) {
    if (i++ >= 5) break;
    embed.addFields({
      name: `يطلب: ${r.wantItem} ${r.locked ? '🔴' : '🟢'}${r.imageUrl ? ' 🖼️' : ''}`,
      value: `👤 <@${r.userId}>\n🎁 مقابله: \`${r.offerItem}\`\n💵 ${r.offerIncome}/sec\n💬 ${r.offers.size} عرض`,
      inline: true
    });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showAllInteraction(interaction) {
  await interaction.reply({ embeds: [
    new EmbedBuilder().setColor('#5865F2')
      .setTitle('📊 نظرة عامة — Steal a Brainrot')
      .addFields(
        { name: '🔄 التريدات النشطة',    value: `${activeTrades.size} تريد`,    inline: true },
        { name: '🛒 الطلبات النشطة',     value: `${activeRequests.size} طلب`,   inline: true },
        { name: '⚖️ التيكيتات المفتوحة', value: `${activeTickets.size} تيكيت`, inline: true }
      ).setTimestamp()
  ], ephemeral: true });
}

// ══════════════════════════════════════════════════════
//  ❓  المساعدة
// ══════════════════════════════════════════════════════
async function handleHelp(message) {
  await message.channel.send({ embeds: [
    new EmbedBuilder().setColor('#5865F2')
      .setTitle('📖 مساعدة البوت — Steal a Brainrot Trading v4')
      .addFields(
        {
          name: '📌 الأوامر المتاحة',
          value:
            '`!تريد` — القائمة الرئيسية (إنشاء تريد أو طلب)\n' +
            '`!طلب` — إنشاء طلب مباشرة\n' +
            '`!تريداتي` — عرض كل التريدات النشطة\n' +
            '`!طلباتي` — عرض كل الطلبات النشطة\n' +
            '`!مساعدة` — هذه القائمة',
          inline: false
        },
        {
          name: '🔄 الفرق بين التريد والطلب',
          value:
            '**تريد** — عندك Brainrot وتبي تبادله\n' +
            '**طلب** — تبي Brainrot معين وعندك ما تعرضه مقابله',
          inline: false
        },
        {
          name: '💬 نظام العروض المتعددة',
          value:
            '• أي شخص يضغط **"💬 تقديم عرض"** ويدخل معلومات ما عنده + صورة\n' +
            '• صاحب التريد/الطلب يوصله **DM فوري** بكل عرض جديد\n' +
            '• يضغط **"👁️ عروضي"** ليشوف كل العروض مرة وحدة\n' +
            '• **✅ قبول** → تيكيت وسيط + DM للمقدّم\n' +
            '• **❌ رفض** → DM للمرفوض + التريد يبقى مفتوح\n' +
            '• التريد مفتوح للعروض حتى تقبل واحداً',
          inline: false
        },
        {
          name: '🖼️ نظام الصور',
          value:
            '• عند إنشاء تريد/طلب → أرسل صورة أو اكتب `skip`\n' +
            '• عند تقديم عرض → أرسل صورة عرضك أو اكتب `skip`\n' +
            '• الصور تظهر في التريد وفي تيكيت الوسيط',
          inline: false
        },
        {
          name: '⚖️ نظام الوسيط',
          value:
            '• عند قبول عرض → تيكيت خاص ينفتح تلقائياً داخل السيرفر\n' +
            '• فقط البائع/الطالب + المشتري/المورّد + رول الوسيط يشوفون التيكيت\n' +
            '• الوسيط يشرف ويضغط ✅ تمت / ❌ إلغاء\n' +
            '• بعد الإتمام أو الإلغاء → **DM** للطرفين تلقائياً 🔒',
          inline: false
        }
      )
      .setFooter({ text: 'Steal a Brainrot Trading Bot v4 — آمن 100% داخل السيرفر' })
      .setTimestamp()
  ]});
}

// ══════════════════════════════════════════════════════
//  🛠️  بنّاءو الـ Modals
// ══════════════════════════════════════════════════════
function buildTradeModal(userId) {
  return new ModalBuilder()
    .setCustomId(`trade_submit_${userId}`)
    .setTitle('🔄 تريد جديد — Steal a Brainrot')
    .addComponents(
      r(inp('offer_item', '🎁 اسم الـ Brainrot اللي تعرضه',  'مثال: Tralalero Tralala (Legendary)', true)),
      r(inp('want_item',  '💰 الشي اللي تبيه مقابله',         'مثال: Bombardiro Crocodilo',           true)),
      r(inp('income',     '💵 الدخل بالثانية',                'مثال: 1,250/sec',                      true)),
      r(inp('upgrades',   '⬆️ التطويرات',                    'مثال: Max | 5/10 | None',               true)),
      r(inp('notes',      '📝 ملاحظات إضافية (اختياري)',      'شروط التريد أو أي تفاصيل...',           false, true))
    );
}

function buildRequestModal(userId) {
  return new ModalBuilder()
    .setCustomId(`request_submit_${userId}`)
    .setTitle('🛒 طلب جديد — Steal a Brainrot')
    .addComponents(
      r(inp('want_item',    '🎯 اسم الـ Brainrot اللي تبيه',       'مثال: Tralalero Tralala',    true)),
      r(inp('want_details', '📋 تفاصيل الطلب (رانك، نوع، إلخ)',    'مثال: Legendary فقط بـ Max', true)),
      r(inp('offer_item',   '🎁 الشي اللي عندك مقابله',             'مثال: Bombardiro Crocodilo', true)),
      r(inp('offer_income', '💵 دخل ما عندك / ميزانيتك',           'مثال: 800/sec',              true)),
      r(inp('notes',        '📝 ملاحظات إضافية (اختياري)',          'أي شروط إضافية...',          false, true))
    );
}

function buildOfferModal(postId, postType) {
  return new ModalBuilder()
    .setCustomId(`offer_submit_${postType}_${postId}`)
    .setTitle(postType === 'trade' ? '💬 عرضك على التريد' : '💬 عرضك على الطلب')
    .addComponents(
      r(inp('offer_item',     '🎁 اسم الـ Brainrot اللي تعرضه',  'مثال: Cappuccino Assassino', true)),
      r(inp('offer_income',   '💵 دخله بالثانية',                'مثال: 900/sec',              true)),
      r(inp('offer_upgrades', '⬆️ تطويراته',                    'مثال: Max | 4/10 | None',    true)),
      r(inp('offer_notes',    '📝 ملاحظات إضافية (اختياري)',     'أي تفاصيل...',               false, true))
    );
}

// ══════════════════════════════════════════════════════
//  🛠️  دوال مساعدة
// ══════════════════════════════════════════════════════
function inp(id, label, placeholder, required = true, paragraph = false) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setPlaceholder(placeholder)
    .setRequired(required)
    .setMaxLength(paragraph ? 200 : 100);
}

function r(component)            { return new ActionRowBuilder().addComponents(component); }
function mkBtn(id, label, style) { return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style); }

function imgRequestEmbed(title) {
  return new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(title)
    .setDescription(
      'أرسل الصورة مباشرة في هذي القناة.\n' +
      '> اكتب `skip` لتخطي هذي الخطوة'
    )
    .setTimestamp();
}

async function extractImage(message) {
  // ── رسالة skip ──
  if (message.content.toLowerCase() === 'skip') {
    try { await message.delete(); } catch {}
    return null;
  }

  if (message.attachments.size > 0) {
    const att = message.attachments.first();
    if (att.contentType?.startsWith('image/')) {
      // ✅ ارسل الصورة للقناة المخفية واحذفها من الشات
      if (IMAGE_STORAGE_CHANNEL_ID) {
        try {
          const storageChannel = client.channels.cache.get(IMAGE_STORAGE_CHANNEL_ID);
          if (storageChannel) {
            const stored = await storageChannel.send({
              files: [{ attachment: att.url, name: att.name }]
            });
            // احذف الرسالة الأصلية من الشات
            try { await message.delete(); } catch {}
            // ارجع رابط الصورة من القناة المخفية
            return stored.attachments.first()?.url || att.url;
          }
        } catch {}
      }
      // لو ما في قناة مخفية، ابقي الصورة في الشات
      return att.url;
    }
    // ملف غلط
    try { await message.delete(); } catch {}
    try {
      const u = await client.users.fetch(message.author.id);
      await u.send({ content: '❌ الملف مو صورة! أرسل صورة صحيحة أو اكتب `skip`' });
    } catch {}
    return false;
  }

  // رسالة نصية بدون صورة
  try { await message.delete(); } catch {}
  try {
    const u = await client.users.fetch(message.author.id);
    await u.send({ content: '❌ أرسل صورة أو اكتب `skip` لتخطي هذي الخطوة' });
  } catch {}
  return false;
}

// ══════════════════════════════════════════════════════
client.login(TOKEN);
