// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $CategoriesTable extends Categories
    with TableInfo<$CategoriesTable, Category> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CategoriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameEnMeta = const VerificationMeta('nameEn');
  @override
  late final GeneratedColumn<String> nameEn = GeneratedColumn<String>(
    'name_en',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameAmMeta = const VerificationMeta('nameAm');
  @override
  late final GeneratedColumn<String> nameAm = GeneratedColumn<String>(
    'name_am',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, nameEn, nameAm, sortOrder];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'categories';
  @override
  VerificationContext validateIntegrity(
    Insertable<Category> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name_en')) {
      context.handle(
        _nameEnMeta,
        nameEn.isAcceptableOrUnknown(data['name_en']!, _nameEnMeta),
      );
    } else if (isInserting) {
      context.missing(_nameEnMeta);
    }
    if (data.containsKey('name_am')) {
      context.handle(
        _nameAmMeta,
        nameAm.isAcceptableOrUnknown(data['name_am']!, _nameAmMeta),
      );
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    } else if (isInserting) {
      context.missing(_sortOrderMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Category map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Category(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      nameEn: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_en'],
      )!,
      nameAm: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_am'],
      ),
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
    );
  }

  @override
  $CategoriesTable createAlias(String alias) {
    return $CategoriesTable(attachedDatabase, alias);
  }
}

class Category extends DataClass implements Insertable<Category> {
  final String id;
  final String nameEn;
  final String? nameAm;
  final int sortOrder;
  const Category({
    required this.id,
    required this.nameEn,
    this.nameAm,
    required this.sortOrder,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name_en'] = Variable<String>(nameEn);
    if (!nullToAbsent || nameAm != null) {
      map['name_am'] = Variable<String>(nameAm);
    }
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  CategoriesCompanion toCompanion(bool nullToAbsent) {
    return CategoriesCompanion(
      id: Value(id),
      nameEn: Value(nameEn),
      nameAm: nameAm == null && nullToAbsent
          ? const Value.absent()
          : Value(nameAm),
      sortOrder: Value(sortOrder),
    );
  }

  factory Category.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Category(
      id: serializer.fromJson<String>(json['id']),
      nameEn: serializer.fromJson<String>(json['nameEn']),
      nameAm: serializer.fromJson<String?>(json['nameAm']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'nameEn': serializer.toJson<String>(nameEn),
      'nameAm': serializer.toJson<String?>(nameAm),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  Category copyWith({
    String? id,
    String? nameEn,
    Value<String?> nameAm = const Value.absent(),
    int? sortOrder,
  }) => Category(
    id: id ?? this.id,
    nameEn: nameEn ?? this.nameEn,
    nameAm: nameAm.present ? nameAm.value : this.nameAm,
    sortOrder: sortOrder ?? this.sortOrder,
  );
  Category copyWithCompanion(CategoriesCompanion data) {
    return Category(
      id: data.id.present ? data.id.value : this.id,
      nameEn: data.nameEn.present ? data.nameEn.value : this.nameEn,
      nameAm: data.nameAm.present ? data.nameAm.value : this.nameAm,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Category(')
          ..write('id: $id, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, nameEn, nameAm, sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Category &&
          other.id == this.id &&
          other.nameEn == this.nameEn &&
          other.nameAm == this.nameAm &&
          other.sortOrder == this.sortOrder);
}

class CategoriesCompanion extends UpdateCompanion<Category> {
  final Value<String> id;
  final Value<String> nameEn;
  final Value<String?> nameAm;
  final Value<int> sortOrder;
  final Value<int> rowid;
  const CategoriesCompanion({
    this.id = const Value.absent(),
    this.nameEn = const Value.absent(),
    this.nameAm = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CategoriesCompanion.insert({
    required String id,
    required String nameEn,
    this.nameAm = const Value.absent(),
    required int sortOrder,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       nameEn = Value(nameEn),
       sortOrder = Value(sortOrder);
  static Insertable<Category> custom({
    Expression<String>? id,
    Expression<String>? nameEn,
    Expression<String>? nameAm,
    Expression<int>? sortOrder,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (nameEn != null) 'name_en': nameEn,
      if (nameAm != null) 'name_am': nameAm,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CategoriesCompanion copyWith({
    Value<String>? id,
    Value<String>? nameEn,
    Value<String?>? nameAm,
    Value<int>? sortOrder,
    Value<int>? rowid,
  }) {
    return CategoriesCompanion(
      id: id ?? this.id,
      nameEn: nameEn ?? this.nameEn,
      nameAm: nameAm ?? this.nameAm,
      sortOrder: sortOrder ?? this.sortOrder,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (nameEn.present) {
      map['name_en'] = Variable<String>(nameEn.value);
    }
    if (nameAm.present) {
      map['name_am'] = Variable<String>(nameAm.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CategoriesCompanion(')
          ..write('id: $id, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MenuItemsTable extends MenuItems
    with TableInfo<$MenuItemsTable, MenuItem> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MenuItemsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoryIdMeta = const VerificationMeta(
    'categoryId',
  );
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
    'category_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _nameEnMeta = const VerificationMeta('nameEn');
  @override
  late final GeneratedColumn<String> nameEn = GeneratedColumn<String>(
    'name_en',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameAmMeta = const VerificationMeta('nameAm');
  @override
  late final GeneratedColumn<String> nameAm = GeneratedColumn<String>(
    'name_am',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _priceSantimMeta = const VerificationMeta(
    'priceSantim',
  );
  @override
  late final GeneratedColumn<int> priceSantim = GeneratedColumn<int>(
    'price_santim',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _stationIdMeta = const VerificationMeta(
    'stationId',
  );
  @override
  late final GeneratedColumn<String> stationId = GeneratedColumn<String>(
    'station_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fastingMeta = const VerificationMeta(
    'fasting',
  );
  @override
  late final GeneratedColumn<bool> fasting = GeneratedColumn<bool>(
    'fasting',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("fasting" IN (0, 1))',
    ),
  );
  static const VerificationMeta _soldOutMeta = const VerificationMeta(
    'soldOut',
  );
  @override
  late final GeneratedColumn<bool> soldOut = GeneratedColumn<bool>(
    'sold_out',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("sold_out" IN (0, 1))',
    ),
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _optionGroupIdsMeta = const VerificationMeta(
    'optionGroupIds',
  );
  @override
  late final GeneratedColumn<String> optionGroupIds = GeneratedColumn<String>(
    'option_group_ids',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    categoryId,
    nameEn,
    nameAm,
    priceSantim,
    stationId,
    fasting,
    soldOut,
    sortOrder,
    optionGroupIds,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'menu_items';
  @override
  VerificationContext validateIntegrity(
    Insertable<MenuItem> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
        _categoryIdMeta,
        categoryId.isAcceptableOrUnknown(data['category_id']!, _categoryIdMeta),
      );
    }
    if (data.containsKey('name_en')) {
      context.handle(
        _nameEnMeta,
        nameEn.isAcceptableOrUnknown(data['name_en']!, _nameEnMeta),
      );
    } else if (isInserting) {
      context.missing(_nameEnMeta);
    }
    if (data.containsKey('name_am')) {
      context.handle(
        _nameAmMeta,
        nameAm.isAcceptableOrUnknown(data['name_am']!, _nameAmMeta),
      );
    }
    if (data.containsKey('price_santim')) {
      context.handle(
        _priceSantimMeta,
        priceSantim.isAcceptableOrUnknown(
          data['price_santim']!,
          _priceSantimMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_priceSantimMeta);
    }
    if (data.containsKey('station_id')) {
      context.handle(
        _stationIdMeta,
        stationId.isAcceptableOrUnknown(data['station_id']!, _stationIdMeta),
      );
    } else if (isInserting) {
      context.missing(_stationIdMeta);
    }
    if (data.containsKey('fasting')) {
      context.handle(
        _fastingMeta,
        fasting.isAcceptableOrUnknown(data['fasting']!, _fastingMeta),
      );
    } else if (isInserting) {
      context.missing(_fastingMeta);
    }
    if (data.containsKey('sold_out')) {
      context.handle(
        _soldOutMeta,
        soldOut.isAcceptableOrUnknown(data['sold_out']!, _soldOutMeta),
      );
    } else if (isInserting) {
      context.missing(_soldOutMeta);
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    } else if (isInserting) {
      context.missing(_sortOrderMeta);
    }
    if (data.containsKey('option_group_ids')) {
      context.handle(
        _optionGroupIdsMeta,
        optionGroupIds.isAcceptableOrUnknown(
          data['option_group_ids']!,
          _optionGroupIdsMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_optionGroupIdsMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MenuItem map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MenuItem(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      categoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category_id'],
      ),
      nameEn: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_en'],
      )!,
      nameAm: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_am'],
      ),
      priceSantim: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}price_santim'],
      )!,
      stationId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}station_id'],
      )!,
      fasting: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}fasting'],
      )!,
      soldOut: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}sold_out'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
      optionGroupIds: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}option_group_ids'],
      )!,
    );
  }

  @override
  $MenuItemsTable createAlias(String alias) {
    return $MenuItemsTable(attachedDatabase, alias);
  }
}

class MenuItem extends DataClass implements Insertable<MenuItem> {
  final String id;
  final String? categoryId;
  final String nameEn;
  final String? nameAm;
  final int priceSantim;
  final String stationId;
  final bool fasting;
  final bool soldOut;
  final int sortOrder;

  /// JSON list of option group ids, in order.
  final String optionGroupIds;
  const MenuItem({
    required this.id,
    this.categoryId,
    required this.nameEn,
    this.nameAm,
    required this.priceSantim,
    required this.stationId,
    required this.fasting,
    required this.soldOut,
    required this.sortOrder,
    required this.optionGroupIds,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || categoryId != null) {
      map['category_id'] = Variable<String>(categoryId);
    }
    map['name_en'] = Variable<String>(nameEn);
    if (!nullToAbsent || nameAm != null) {
      map['name_am'] = Variable<String>(nameAm);
    }
    map['price_santim'] = Variable<int>(priceSantim);
    map['station_id'] = Variable<String>(stationId);
    map['fasting'] = Variable<bool>(fasting);
    map['sold_out'] = Variable<bool>(soldOut);
    map['sort_order'] = Variable<int>(sortOrder);
    map['option_group_ids'] = Variable<String>(optionGroupIds);
    return map;
  }

  MenuItemsCompanion toCompanion(bool nullToAbsent) {
    return MenuItemsCompanion(
      id: Value(id),
      categoryId: categoryId == null && nullToAbsent
          ? const Value.absent()
          : Value(categoryId),
      nameEn: Value(nameEn),
      nameAm: nameAm == null && nullToAbsent
          ? const Value.absent()
          : Value(nameAm),
      priceSantim: Value(priceSantim),
      stationId: Value(stationId),
      fasting: Value(fasting),
      soldOut: Value(soldOut),
      sortOrder: Value(sortOrder),
      optionGroupIds: Value(optionGroupIds),
    );
  }

  factory MenuItem.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MenuItem(
      id: serializer.fromJson<String>(json['id']),
      categoryId: serializer.fromJson<String?>(json['categoryId']),
      nameEn: serializer.fromJson<String>(json['nameEn']),
      nameAm: serializer.fromJson<String?>(json['nameAm']),
      priceSantim: serializer.fromJson<int>(json['priceSantim']),
      stationId: serializer.fromJson<String>(json['stationId']),
      fasting: serializer.fromJson<bool>(json['fasting']),
      soldOut: serializer.fromJson<bool>(json['soldOut']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
      optionGroupIds: serializer.fromJson<String>(json['optionGroupIds']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'categoryId': serializer.toJson<String?>(categoryId),
      'nameEn': serializer.toJson<String>(nameEn),
      'nameAm': serializer.toJson<String?>(nameAm),
      'priceSantim': serializer.toJson<int>(priceSantim),
      'stationId': serializer.toJson<String>(stationId),
      'fasting': serializer.toJson<bool>(fasting),
      'soldOut': serializer.toJson<bool>(soldOut),
      'sortOrder': serializer.toJson<int>(sortOrder),
      'optionGroupIds': serializer.toJson<String>(optionGroupIds),
    };
  }

  MenuItem copyWith({
    String? id,
    Value<String?> categoryId = const Value.absent(),
    String? nameEn,
    Value<String?> nameAm = const Value.absent(),
    int? priceSantim,
    String? stationId,
    bool? fasting,
    bool? soldOut,
    int? sortOrder,
    String? optionGroupIds,
  }) => MenuItem(
    id: id ?? this.id,
    categoryId: categoryId.present ? categoryId.value : this.categoryId,
    nameEn: nameEn ?? this.nameEn,
    nameAm: nameAm.present ? nameAm.value : this.nameAm,
    priceSantim: priceSantim ?? this.priceSantim,
    stationId: stationId ?? this.stationId,
    fasting: fasting ?? this.fasting,
    soldOut: soldOut ?? this.soldOut,
    sortOrder: sortOrder ?? this.sortOrder,
    optionGroupIds: optionGroupIds ?? this.optionGroupIds,
  );
  MenuItem copyWithCompanion(MenuItemsCompanion data) {
    return MenuItem(
      id: data.id.present ? data.id.value : this.id,
      categoryId: data.categoryId.present
          ? data.categoryId.value
          : this.categoryId,
      nameEn: data.nameEn.present ? data.nameEn.value : this.nameEn,
      nameAm: data.nameAm.present ? data.nameAm.value : this.nameAm,
      priceSantim: data.priceSantim.present
          ? data.priceSantim.value
          : this.priceSantim,
      stationId: data.stationId.present ? data.stationId.value : this.stationId,
      fasting: data.fasting.present ? data.fasting.value : this.fasting,
      soldOut: data.soldOut.present ? data.soldOut.value : this.soldOut,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      optionGroupIds: data.optionGroupIds.present
          ? data.optionGroupIds.value
          : this.optionGroupIds,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MenuItem(')
          ..write('id: $id, ')
          ..write('categoryId: $categoryId, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('priceSantim: $priceSantim, ')
          ..write('stationId: $stationId, ')
          ..write('fasting: $fasting, ')
          ..write('soldOut: $soldOut, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('optionGroupIds: $optionGroupIds')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    categoryId,
    nameEn,
    nameAm,
    priceSantim,
    stationId,
    fasting,
    soldOut,
    sortOrder,
    optionGroupIds,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MenuItem &&
          other.id == this.id &&
          other.categoryId == this.categoryId &&
          other.nameEn == this.nameEn &&
          other.nameAm == this.nameAm &&
          other.priceSantim == this.priceSantim &&
          other.stationId == this.stationId &&
          other.fasting == this.fasting &&
          other.soldOut == this.soldOut &&
          other.sortOrder == this.sortOrder &&
          other.optionGroupIds == this.optionGroupIds);
}

class MenuItemsCompanion extends UpdateCompanion<MenuItem> {
  final Value<String> id;
  final Value<String?> categoryId;
  final Value<String> nameEn;
  final Value<String?> nameAm;
  final Value<int> priceSantim;
  final Value<String> stationId;
  final Value<bool> fasting;
  final Value<bool> soldOut;
  final Value<int> sortOrder;
  final Value<String> optionGroupIds;
  final Value<int> rowid;
  const MenuItemsCompanion({
    this.id = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.nameEn = const Value.absent(),
    this.nameAm = const Value.absent(),
    this.priceSantim = const Value.absent(),
    this.stationId = const Value.absent(),
    this.fasting = const Value.absent(),
    this.soldOut = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.optionGroupIds = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MenuItemsCompanion.insert({
    required String id,
    this.categoryId = const Value.absent(),
    required String nameEn,
    this.nameAm = const Value.absent(),
    required int priceSantim,
    required String stationId,
    required bool fasting,
    required bool soldOut,
    required int sortOrder,
    required String optionGroupIds,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       nameEn = Value(nameEn),
       priceSantim = Value(priceSantim),
       stationId = Value(stationId),
       fasting = Value(fasting),
       soldOut = Value(soldOut),
       sortOrder = Value(sortOrder),
       optionGroupIds = Value(optionGroupIds);
  static Insertable<MenuItem> custom({
    Expression<String>? id,
    Expression<String>? categoryId,
    Expression<String>? nameEn,
    Expression<String>? nameAm,
    Expression<int>? priceSantim,
    Expression<String>? stationId,
    Expression<bool>? fasting,
    Expression<bool>? soldOut,
    Expression<int>? sortOrder,
    Expression<String>? optionGroupIds,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (categoryId != null) 'category_id': categoryId,
      if (nameEn != null) 'name_en': nameEn,
      if (nameAm != null) 'name_am': nameAm,
      if (priceSantim != null) 'price_santim': priceSantim,
      if (stationId != null) 'station_id': stationId,
      if (fasting != null) 'fasting': fasting,
      if (soldOut != null) 'sold_out': soldOut,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (optionGroupIds != null) 'option_group_ids': optionGroupIds,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MenuItemsCompanion copyWith({
    Value<String>? id,
    Value<String?>? categoryId,
    Value<String>? nameEn,
    Value<String?>? nameAm,
    Value<int>? priceSantim,
    Value<String>? stationId,
    Value<bool>? fasting,
    Value<bool>? soldOut,
    Value<int>? sortOrder,
    Value<String>? optionGroupIds,
    Value<int>? rowid,
  }) {
    return MenuItemsCompanion(
      id: id ?? this.id,
      categoryId: categoryId ?? this.categoryId,
      nameEn: nameEn ?? this.nameEn,
      nameAm: nameAm ?? this.nameAm,
      priceSantim: priceSantim ?? this.priceSantim,
      stationId: stationId ?? this.stationId,
      fasting: fasting ?? this.fasting,
      soldOut: soldOut ?? this.soldOut,
      sortOrder: sortOrder ?? this.sortOrder,
      optionGroupIds: optionGroupIds ?? this.optionGroupIds,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (nameEn.present) {
      map['name_en'] = Variable<String>(nameEn.value);
    }
    if (nameAm.present) {
      map['name_am'] = Variable<String>(nameAm.value);
    }
    if (priceSantim.present) {
      map['price_santim'] = Variable<int>(priceSantim.value);
    }
    if (stationId.present) {
      map['station_id'] = Variable<String>(stationId.value);
    }
    if (fasting.present) {
      map['fasting'] = Variable<bool>(fasting.value);
    }
    if (soldOut.present) {
      map['sold_out'] = Variable<bool>(soldOut.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (optionGroupIds.present) {
      map['option_group_ids'] = Variable<String>(optionGroupIds.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MenuItemsCompanion(')
          ..write('id: $id, ')
          ..write('categoryId: $categoryId, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('priceSantim: $priceSantim, ')
          ..write('stationId: $stationId, ')
          ..write('fasting: $fasting, ')
          ..write('soldOut: $soldOut, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('optionGroupIds: $optionGroupIds, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OptionGroupsTable extends OptionGroups
    with TableInfo<$OptionGroupsTable, OptionGroup> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OptionGroupsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameEnMeta = const VerificationMeta('nameEn');
  @override
  late final GeneratedColumn<String> nameEn = GeneratedColumn<String>(
    'name_en',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameAmMeta = const VerificationMeta('nameAm');
  @override
  late final GeneratedColumn<String> nameAm = GeneratedColumn<String>(
    'name_am',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _minChoicesMeta = const VerificationMeta(
    'minChoices',
  );
  @override
  late final GeneratedColumn<int> minChoices = GeneratedColumn<int>(
    'min_choices',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _maxChoicesMeta = const VerificationMeta(
    'maxChoices',
  );
  @override
  late final GeneratedColumn<int> maxChoices = GeneratedColumn<int>(
    'max_choices',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    nameEn,
    nameAm,
    minChoices,
    maxChoices,
    sortOrder,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'option_groups';
  @override
  VerificationContext validateIntegrity(
    Insertable<OptionGroup> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name_en')) {
      context.handle(
        _nameEnMeta,
        nameEn.isAcceptableOrUnknown(data['name_en']!, _nameEnMeta),
      );
    } else if (isInserting) {
      context.missing(_nameEnMeta);
    }
    if (data.containsKey('name_am')) {
      context.handle(
        _nameAmMeta,
        nameAm.isAcceptableOrUnknown(data['name_am']!, _nameAmMeta),
      );
    }
    if (data.containsKey('min_choices')) {
      context.handle(
        _minChoicesMeta,
        minChoices.isAcceptableOrUnknown(data['min_choices']!, _minChoicesMeta),
      );
    } else if (isInserting) {
      context.missing(_minChoicesMeta);
    }
    if (data.containsKey('max_choices')) {
      context.handle(
        _maxChoicesMeta,
        maxChoices.isAcceptableOrUnknown(data['max_choices']!, _maxChoicesMeta),
      );
    } else if (isInserting) {
      context.missing(_maxChoicesMeta);
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    } else if (isInserting) {
      context.missing(_sortOrderMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  OptionGroup map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OptionGroup(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      nameEn: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_en'],
      )!,
      nameAm: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_am'],
      ),
      minChoices: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}min_choices'],
      )!,
      maxChoices: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}max_choices'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
    );
  }

  @override
  $OptionGroupsTable createAlias(String alias) {
    return $OptionGroupsTable(attachedDatabase, alias);
  }
}

class OptionGroup extends DataClass implements Insertable<OptionGroup> {
  final String id;
  final String nameEn;
  final String? nameAm;
  final int minChoices;
  final int maxChoices;
  final int sortOrder;
  const OptionGroup({
    required this.id,
    required this.nameEn,
    this.nameAm,
    required this.minChoices,
    required this.maxChoices,
    required this.sortOrder,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name_en'] = Variable<String>(nameEn);
    if (!nullToAbsent || nameAm != null) {
      map['name_am'] = Variable<String>(nameAm);
    }
    map['min_choices'] = Variable<int>(minChoices);
    map['max_choices'] = Variable<int>(maxChoices);
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  OptionGroupsCompanion toCompanion(bool nullToAbsent) {
    return OptionGroupsCompanion(
      id: Value(id),
      nameEn: Value(nameEn),
      nameAm: nameAm == null && nullToAbsent
          ? const Value.absent()
          : Value(nameAm),
      minChoices: Value(minChoices),
      maxChoices: Value(maxChoices),
      sortOrder: Value(sortOrder),
    );
  }

  factory OptionGroup.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OptionGroup(
      id: serializer.fromJson<String>(json['id']),
      nameEn: serializer.fromJson<String>(json['nameEn']),
      nameAm: serializer.fromJson<String?>(json['nameAm']),
      minChoices: serializer.fromJson<int>(json['minChoices']),
      maxChoices: serializer.fromJson<int>(json['maxChoices']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'nameEn': serializer.toJson<String>(nameEn),
      'nameAm': serializer.toJson<String?>(nameAm),
      'minChoices': serializer.toJson<int>(minChoices),
      'maxChoices': serializer.toJson<int>(maxChoices),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  OptionGroup copyWith({
    String? id,
    String? nameEn,
    Value<String?> nameAm = const Value.absent(),
    int? minChoices,
    int? maxChoices,
    int? sortOrder,
  }) => OptionGroup(
    id: id ?? this.id,
    nameEn: nameEn ?? this.nameEn,
    nameAm: nameAm.present ? nameAm.value : this.nameAm,
    minChoices: minChoices ?? this.minChoices,
    maxChoices: maxChoices ?? this.maxChoices,
    sortOrder: sortOrder ?? this.sortOrder,
  );
  OptionGroup copyWithCompanion(OptionGroupsCompanion data) {
    return OptionGroup(
      id: data.id.present ? data.id.value : this.id,
      nameEn: data.nameEn.present ? data.nameEn.value : this.nameEn,
      nameAm: data.nameAm.present ? data.nameAm.value : this.nameAm,
      minChoices: data.minChoices.present
          ? data.minChoices.value
          : this.minChoices,
      maxChoices: data.maxChoices.present
          ? data.maxChoices.value
          : this.maxChoices,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OptionGroup(')
          ..write('id: $id, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('minChoices: $minChoices, ')
          ..write('maxChoices: $maxChoices, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, nameEn, nameAm, minChoices, maxChoices, sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OptionGroup &&
          other.id == this.id &&
          other.nameEn == this.nameEn &&
          other.nameAm == this.nameAm &&
          other.minChoices == this.minChoices &&
          other.maxChoices == this.maxChoices &&
          other.sortOrder == this.sortOrder);
}

class OptionGroupsCompanion extends UpdateCompanion<OptionGroup> {
  final Value<String> id;
  final Value<String> nameEn;
  final Value<String?> nameAm;
  final Value<int> minChoices;
  final Value<int> maxChoices;
  final Value<int> sortOrder;
  final Value<int> rowid;
  const OptionGroupsCompanion({
    this.id = const Value.absent(),
    this.nameEn = const Value.absent(),
    this.nameAm = const Value.absent(),
    this.minChoices = const Value.absent(),
    this.maxChoices = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OptionGroupsCompanion.insert({
    required String id,
    required String nameEn,
    this.nameAm = const Value.absent(),
    required int minChoices,
    required int maxChoices,
    required int sortOrder,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       nameEn = Value(nameEn),
       minChoices = Value(minChoices),
       maxChoices = Value(maxChoices),
       sortOrder = Value(sortOrder);
  static Insertable<OptionGroup> custom({
    Expression<String>? id,
    Expression<String>? nameEn,
    Expression<String>? nameAm,
    Expression<int>? minChoices,
    Expression<int>? maxChoices,
    Expression<int>? sortOrder,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (nameEn != null) 'name_en': nameEn,
      if (nameAm != null) 'name_am': nameAm,
      if (minChoices != null) 'min_choices': minChoices,
      if (maxChoices != null) 'max_choices': maxChoices,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OptionGroupsCompanion copyWith({
    Value<String>? id,
    Value<String>? nameEn,
    Value<String?>? nameAm,
    Value<int>? minChoices,
    Value<int>? maxChoices,
    Value<int>? sortOrder,
    Value<int>? rowid,
  }) {
    return OptionGroupsCompanion(
      id: id ?? this.id,
      nameEn: nameEn ?? this.nameEn,
      nameAm: nameAm ?? this.nameAm,
      minChoices: minChoices ?? this.minChoices,
      maxChoices: maxChoices ?? this.maxChoices,
      sortOrder: sortOrder ?? this.sortOrder,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (nameEn.present) {
      map['name_en'] = Variable<String>(nameEn.value);
    }
    if (nameAm.present) {
      map['name_am'] = Variable<String>(nameAm.value);
    }
    if (minChoices.present) {
      map['min_choices'] = Variable<int>(minChoices.value);
    }
    if (maxChoices.present) {
      map['max_choices'] = Variable<int>(maxChoices.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OptionGroupsCompanion(')
          ..write('id: $id, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('minChoices: $minChoices, ')
          ..write('maxChoices: $maxChoices, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OptionChoicesTable extends OptionChoices
    with TableInfo<$OptionChoicesTable, OptionChoice> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OptionChoicesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _groupIdMeta = const VerificationMeta(
    'groupId',
  );
  @override
  late final GeneratedColumn<String> groupId = GeneratedColumn<String>(
    'group_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameEnMeta = const VerificationMeta('nameEn');
  @override
  late final GeneratedColumn<String> nameEn = GeneratedColumn<String>(
    'name_en',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameAmMeta = const VerificationMeta('nameAm');
  @override
  late final GeneratedColumn<String> nameAm = GeneratedColumn<String>(
    'name_am',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _extraSantimMeta = const VerificationMeta(
    'extraSantim',
  );
  @override
  late final GeneratedColumn<int> extraSantim = GeneratedColumn<int>(
    'extra_santim',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    groupId,
    nameEn,
    nameAm,
    extraSantim,
    sortOrder,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'options';
  @override
  VerificationContext validateIntegrity(
    Insertable<OptionChoice> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('group_id')) {
      context.handle(
        _groupIdMeta,
        groupId.isAcceptableOrUnknown(data['group_id']!, _groupIdMeta),
      );
    } else if (isInserting) {
      context.missing(_groupIdMeta);
    }
    if (data.containsKey('name_en')) {
      context.handle(
        _nameEnMeta,
        nameEn.isAcceptableOrUnknown(data['name_en']!, _nameEnMeta),
      );
    } else if (isInserting) {
      context.missing(_nameEnMeta);
    }
    if (data.containsKey('name_am')) {
      context.handle(
        _nameAmMeta,
        nameAm.isAcceptableOrUnknown(data['name_am']!, _nameAmMeta),
      );
    }
    if (data.containsKey('extra_santim')) {
      context.handle(
        _extraSantimMeta,
        extraSantim.isAcceptableOrUnknown(
          data['extra_santim']!,
          _extraSantimMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_extraSantimMeta);
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    } else if (isInserting) {
      context.missing(_sortOrderMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  OptionChoice map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OptionChoice(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      groupId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}group_id'],
      )!,
      nameEn: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_en'],
      )!,
      nameAm: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_am'],
      ),
      extraSantim: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}extra_santim'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
    );
  }

  @override
  $OptionChoicesTable createAlias(String alias) {
    return $OptionChoicesTable(attachedDatabase, alias);
  }
}

class OptionChoice extends DataClass implements Insertable<OptionChoice> {
  final String id;
  final String groupId;
  final String nameEn;
  final String? nameAm;
  final int extraSantim;
  final int sortOrder;
  const OptionChoice({
    required this.id,
    required this.groupId,
    required this.nameEn,
    this.nameAm,
    required this.extraSantim,
    required this.sortOrder,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['group_id'] = Variable<String>(groupId);
    map['name_en'] = Variable<String>(nameEn);
    if (!nullToAbsent || nameAm != null) {
      map['name_am'] = Variable<String>(nameAm);
    }
    map['extra_santim'] = Variable<int>(extraSantim);
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  OptionChoicesCompanion toCompanion(bool nullToAbsent) {
    return OptionChoicesCompanion(
      id: Value(id),
      groupId: Value(groupId),
      nameEn: Value(nameEn),
      nameAm: nameAm == null && nullToAbsent
          ? const Value.absent()
          : Value(nameAm),
      extraSantim: Value(extraSantim),
      sortOrder: Value(sortOrder),
    );
  }

  factory OptionChoice.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OptionChoice(
      id: serializer.fromJson<String>(json['id']),
      groupId: serializer.fromJson<String>(json['groupId']),
      nameEn: serializer.fromJson<String>(json['nameEn']),
      nameAm: serializer.fromJson<String?>(json['nameAm']),
      extraSantim: serializer.fromJson<int>(json['extraSantim']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'groupId': serializer.toJson<String>(groupId),
      'nameEn': serializer.toJson<String>(nameEn),
      'nameAm': serializer.toJson<String?>(nameAm),
      'extraSantim': serializer.toJson<int>(extraSantim),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  OptionChoice copyWith({
    String? id,
    String? groupId,
    String? nameEn,
    Value<String?> nameAm = const Value.absent(),
    int? extraSantim,
    int? sortOrder,
  }) => OptionChoice(
    id: id ?? this.id,
    groupId: groupId ?? this.groupId,
    nameEn: nameEn ?? this.nameEn,
    nameAm: nameAm.present ? nameAm.value : this.nameAm,
    extraSantim: extraSantim ?? this.extraSantim,
    sortOrder: sortOrder ?? this.sortOrder,
  );
  OptionChoice copyWithCompanion(OptionChoicesCompanion data) {
    return OptionChoice(
      id: data.id.present ? data.id.value : this.id,
      groupId: data.groupId.present ? data.groupId.value : this.groupId,
      nameEn: data.nameEn.present ? data.nameEn.value : this.nameEn,
      nameAm: data.nameAm.present ? data.nameAm.value : this.nameAm,
      extraSantim: data.extraSantim.present
          ? data.extraSantim.value
          : this.extraSantim,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OptionChoice(')
          ..write('id: $id, ')
          ..write('groupId: $groupId, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('extraSantim: $extraSantim, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, groupId, nameEn, nameAm, extraSantim, sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OptionChoice &&
          other.id == this.id &&
          other.groupId == this.groupId &&
          other.nameEn == this.nameEn &&
          other.nameAm == this.nameAm &&
          other.extraSantim == this.extraSantim &&
          other.sortOrder == this.sortOrder);
}

class OptionChoicesCompanion extends UpdateCompanion<OptionChoice> {
  final Value<String> id;
  final Value<String> groupId;
  final Value<String> nameEn;
  final Value<String?> nameAm;
  final Value<int> extraSantim;
  final Value<int> sortOrder;
  final Value<int> rowid;
  const OptionChoicesCompanion({
    this.id = const Value.absent(),
    this.groupId = const Value.absent(),
    this.nameEn = const Value.absent(),
    this.nameAm = const Value.absent(),
    this.extraSantim = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OptionChoicesCompanion.insert({
    required String id,
    required String groupId,
    required String nameEn,
    this.nameAm = const Value.absent(),
    required int extraSantim,
    required int sortOrder,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       groupId = Value(groupId),
       nameEn = Value(nameEn),
       extraSantim = Value(extraSantim),
       sortOrder = Value(sortOrder);
  static Insertable<OptionChoice> custom({
    Expression<String>? id,
    Expression<String>? groupId,
    Expression<String>? nameEn,
    Expression<String>? nameAm,
    Expression<int>? extraSantim,
    Expression<int>? sortOrder,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (groupId != null) 'group_id': groupId,
      if (nameEn != null) 'name_en': nameEn,
      if (nameAm != null) 'name_am': nameAm,
      if (extraSantim != null) 'extra_santim': extraSantim,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OptionChoicesCompanion copyWith({
    Value<String>? id,
    Value<String>? groupId,
    Value<String>? nameEn,
    Value<String?>? nameAm,
    Value<int>? extraSantim,
    Value<int>? sortOrder,
    Value<int>? rowid,
  }) {
    return OptionChoicesCompanion(
      id: id ?? this.id,
      groupId: groupId ?? this.groupId,
      nameEn: nameEn ?? this.nameEn,
      nameAm: nameAm ?? this.nameAm,
      extraSantim: extraSantim ?? this.extraSantim,
      sortOrder: sortOrder ?? this.sortOrder,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (groupId.present) {
      map['group_id'] = Variable<String>(groupId.value);
    }
    if (nameEn.present) {
      map['name_en'] = Variable<String>(nameEn.value);
    }
    if (nameAm.present) {
      map['name_am'] = Variable<String>(nameAm.value);
    }
    if (extraSantim.present) {
      map['extra_santim'] = Variable<int>(extraSantim.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OptionChoicesCompanion(')
          ..write('id: $id, ')
          ..write('groupId: $groupId, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('extraSantim: $extraSantim, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CafeTablesTable extends CafeTables
    with TableInfo<$CafeTablesTable, CafeTable> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CafeTablesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _areaMeta = const VerificationMeta('area');
  @override
  late final GeneratedColumn<String> area = GeneratedColumn<String>(
    'area',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _seatsMeta = const VerificationMeta('seats');
  @override
  late final GeneratedColumn<int> seats = GeneratedColumn<int>(
    'seats',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _stateMeta = const VerificationMeta('state');
  @override
  late final GeneratedColumn<String> state = GeneratedColumn<String>(
    'state',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sessionIdMeta = const VerificationMeta(
    'sessionId',
  );
  @override
  late final GeneratedColumn<String> sessionId = GeneratedColumn<String>(
    'session_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _waiterIdMeta = const VerificationMeta(
    'waiterId',
  );
  @override
  late final GeneratedColumn<String> waiterId = GeneratedColumn<String>(
    'waiter_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    area,
    seats,
    sortOrder,
    state,
    sessionId,
    waiterId,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cafe_tables';
  @override
  VerificationContext validateIntegrity(
    Insertable<CafeTable> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('area')) {
      context.handle(
        _areaMeta,
        area.isAcceptableOrUnknown(data['area']!, _areaMeta),
      );
    }
    if (data.containsKey('seats')) {
      context.handle(
        _seatsMeta,
        seats.isAcceptableOrUnknown(data['seats']!, _seatsMeta),
      );
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    } else if (isInserting) {
      context.missing(_sortOrderMeta);
    }
    if (data.containsKey('state')) {
      context.handle(
        _stateMeta,
        state.isAcceptableOrUnknown(data['state']!, _stateMeta),
      );
    } else if (isInserting) {
      context.missing(_stateMeta);
    }
    if (data.containsKey('session_id')) {
      context.handle(
        _sessionIdMeta,
        sessionId.isAcceptableOrUnknown(data['session_id']!, _sessionIdMeta),
      );
    }
    if (data.containsKey('waiter_id')) {
      context.handle(
        _waiterIdMeta,
        waiterId.isAcceptableOrUnknown(data['waiter_id']!, _waiterIdMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CafeTable map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CafeTable(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      area: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}area'],
      ),
      seats: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}seats'],
      ),
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
      state: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}state'],
      )!,
      sessionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_id'],
      ),
      waiterId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}waiter_id'],
      ),
    );
  }

  @override
  $CafeTablesTable createAlias(String alias) {
    return $CafeTablesTable(attachedDatabase, alias);
  }
}

class CafeTable extends DataClass implements Insertable<CafeTable> {
  final String id;
  final String name;
  final String? area;
  final int? seats;
  final int sortOrder;
  final String state;
  final String? sessionId;
  final String? waiterId;
  const CafeTable({
    required this.id,
    required this.name,
    this.area,
    this.seats,
    required this.sortOrder,
    required this.state,
    this.sessionId,
    this.waiterId,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || area != null) {
      map['area'] = Variable<String>(area);
    }
    if (!nullToAbsent || seats != null) {
      map['seats'] = Variable<int>(seats);
    }
    map['sort_order'] = Variable<int>(sortOrder);
    map['state'] = Variable<String>(state);
    if (!nullToAbsent || sessionId != null) {
      map['session_id'] = Variable<String>(sessionId);
    }
    if (!nullToAbsent || waiterId != null) {
      map['waiter_id'] = Variable<String>(waiterId);
    }
    return map;
  }

  CafeTablesCompanion toCompanion(bool nullToAbsent) {
    return CafeTablesCompanion(
      id: Value(id),
      name: Value(name),
      area: area == null && nullToAbsent ? const Value.absent() : Value(area),
      seats: seats == null && nullToAbsent
          ? const Value.absent()
          : Value(seats),
      sortOrder: Value(sortOrder),
      state: Value(state),
      sessionId: sessionId == null && nullToAbsent
          ? const Value.absent()
          : Value(sessionId),
      waiterId: waiterId == null && nullToAbsent
          ? const Value.absent()
          : Value(waiterId),
    );
  }

  factory CafeTable.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CafeTable(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      area: serializer.fromJson<String?>(json['area']),
      seats: serializer.fromJson<int?>(json['seats']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
      state: serializer.fromJson<String>(json['state']),
      sessionId: serializer.fromJson<String?>(json['sessionId']),
      waiterId: serializer.fromJson<String?>(json['waiterId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'area': serializer.toJson<String?>(area),
      'seats': serializer.toJson<int?>(seats),
      'sortOrder': serializer.toJson<int>(sortOrder),
      'state': serializer.toJson<String>(state),
      'sessionId': serializer.toJson<String?>(sessionId),
      'waiterId': serializer.toJson<String?>(waiterId),
    };
  }

  CafeTable copyWith({
    String? id,
    String? name,
    Value<String?> area = const Value.absent(),
    Value<int?> seats = const Value.absent(),
    int? sortOrder,
    String? state,
    Value<String?> sessionId = const Value.absent(),
    Value<String?> waiterId = const Value.absent(),
  }) => CafeTable(
    id: id ?? this.id,
    name: name ?? this.name,
    area: area.present ? area.value : this.area,
    seats: seats.present ? seats.value : this.seats,
    sortOrder: sortOrder ?? this.sortOrder,
    state: state ?? this.state,
    sessionId: sessionId.present ? sessionId.value : this.sessionId,
    waiterId: waiterId.present ? waiterId.value : this.waiterId,
  );
  CafeTable copyWithCompanion(CafeTablesCompanion data) {
    return CafeTable(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      area: data.area.present ? data.area.value : this.area,
      seats: data.seats.present ? data.seats.value : this.seats,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      state: data.state.present ? data.state.value : this.state,
      sessionId: data.sessionId.present ? data.sessionId.value : this.sessionId,
      waiterId: data.waiterId.present ? data.waiterId.value : this.waiterId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CafeTable(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('area: $area, ')
          ..write('seats: $seats, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('state: $state, ')
          ..write('sessionId: $sessionId, ')
          ..write('waiterId: $waiterId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, name, area, seats, sortOrder, state, sessionId, waiterId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CafeTable &&
          other.id == this.id &&
          other.name == this.name &&
          other.area == this.area &&
          other.seats == this.seats &&
          other.sortOrder == this.sortOrder &&
          other.state == this.state &&
          other.sessionId == this.sessionId &&
          other.waiterId == this.waiterId);
}

class CafeTablesCompanion extends UpdateCompanion<CafeTable> {
  final Value<String> id;
  final Value<String> name;
  final Value<String?> area;
  final Value<int?> seats;
  final Value<int> sortOrder;
  final Value<String> state;
  final Value<String?> sessionId;
  final Value<String?> waiterId;
  final Value<int> rowid;
  const CafeTablesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.area = const Value.absent(),
    this.seats = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.state = const Value.absent(),
    this.sessionId = const Value.absent(),
    this.waiterId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CafeTablesCompanion.insert({
    required String id,
    required String name,
    this.area = const Value.absent(),
    this.seats = const Value.absent(),
    required int sortOrder,
    required String state,
    this.sessionId = const Value.absent(),
    this.waiterId = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       sortOrder = Value(sortOrder),
       state = Value(state);
  static Insertable<CafeTable> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? area,
    Expression<int>? seats,
    Expression<int>? sortOrder,
    Expression<String>? state,
    Expression<String>? sessionId,
    Expression<String>? waiterId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (area != null) 'area': area,
      if (seats != null) 'seats': seats,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (state != null) 'state': state,
      if (sessionId != null) 'session_id': sessionId,
      if (waiterId != null) 'waiter_id': waiterId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CafeTablesCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String?>? area,
    Value<int?>? seats,
    Value<int>? sortOrder,
    Value<String>? state,
    Value<String?>? sessionId,
    Value<String?>? waiterId,
    Value<int>? rowid,
  }) {
    return CafeTablesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      area: area ?? this.area,
      seats: seats ?? this.seats,
      sortOrder: sortOrder ?? this.sortOrder,
      state: state ?? this.state,
      sessionId: sessionId ?? this.sessionId,
      waiterId: waiterId ?? this.waiterId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (area.present) {
      map['area'] = Variable<String>(area.value);
    }
    if (seats.present) {
      map['seats'] = Variable<int>(seats.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (state.present) {
      map['state'] = Variable<String>(state.value);
    }
    if (sessionId.present) {
      map['session_id'] = Variable<String>(sessionId.value);
    }
    if (waiterId.present) {
      map['waiter_id'] = Variable<String>(waiterId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CafeTablesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('area: $area, ')
          ..write('seats: $seats, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('state: $state, ')
          ..write('sessionId: $sessionId, ')
          ..write('waiterId: $waiterId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OutboxEntriesTable extends OutboxEntries
    with TableInfo<$OutboxEntriesTable, OutboxEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OutboxEntriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _messageMeta = const VerificationMeta(
    'message',
  );
  @override
  late final GeneratedColumn<String> message = GeneratedColumn<String>(
    'message',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _errorMeta = const VerificationMeta('error');
  @override
  late final GeneratedColumn<String> error = GeneratedColumn<String>(
    'error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    key,
    message,
    createdAt,
    status,
    error,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'outbox';
  @override
  VerificationContext validateIntegrity(
    Insertable<OutboxEntry> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('message')) {
      context.handle(
        _messageMeta,
        message.isAcceptableOrUnknown(data['message']!, _messageMeta),
      );
    } else if (isInserting) {
      context.missing(_messageMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('error')) {
      context.handle(
        _errorMeta,
        error.isAcceptableOrUnknown(data['error']!, _errorMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  OutboxEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OutboxEntry(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      message: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}message'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      error: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}error'],
      ),
    );
  }

  @override
  $OutboxEntriesTable createAlias(String alias) {
    return $OutboxEntriesTable(attachedDatabase, alias);
  }
}

class OutboxEntry extends DataClass implements Insertable<OutboxEntry> {
  /// The idempotency key (the order id for order.send).
  final String key;

  /// The exact JSON message: a retry must be byte-identical to the first attempt (F1b).
  final String message;
  final int createdAt;

  /// pending, or needs_attention (the server refused it; the waiter must look).
  final String status;
  final String? error;
  const OutboxEntry({
    required this.key,
    required this.message,
    required this.createdAt,
    required this.status,
    this.error,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['message'] = Variable<String>(message);
    map['created_at'] = Variable<int>(createdAt);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || error != null) {
      map['error'] = Variable<String>(error);
    }
    return map;
  }

  OutboxEntriesCompanion toCompanion(bool nullToAbsent) {
    return OutboxEntriesCompanion(
      key: Value(key),
      message: Value(message),
      createdAt: Value(createdAt),
      status: Value(status),
      error: error == null && nullToAbsent
          ? const Value.absent()
          : Value(error),
    );
  }

  factory OutboxEntry.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OutboxEntry(
      key: serializer.fromJson<String>(json['key']),
      message: serializer.fromJson<String>(json['message']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      status: serializer.fromJson<String>(json['status']),
      error: serializer.fromJson<String?>(json['error']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'message': serializer.toJson<String>(message),
      'createdAt': serializer.toJson<int>(createdAt),
      'status': serializer.toJson<String>(status),
      'error': serializer.toJson<String?>(error),
    };
  }

  OutboxEntry copyWith({
    String? key,
    String? message,
    int? createdAt,
    String? status,
    Value<String?> error = const Value.absent(),
  }) => OutboxEntry(
    key: key ?? this.key,
    message: message ?? this.message,
    createdAt: createdAt ?? this.createdAt,
    status: status ?? this.status,
    error: error.present ? error.value : this.error,
  );
  OutboxEntry copyWithCompanion(OutboxEntriesCompanion data) {
    return OutboxEntry(
      key: data.key.present ? data.key.value : this.key,
      message: data.message.present ? data.message.value : this.message,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      status: data.status.present ? data.status.value : this.status,
      error: data.error.present ? data.error.value : this.error,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OutboxEntry(')
          ..write('key: $key, ')
          ..write('message: $message, ')
          ..write('createdAt: $createdAt, ')
          ..write('status: $status, ')
          ..write('error: $error')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, message, createdAt, status, error);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OutboxEntry &&
          other.key == this.key &&
          other.message == this.message &&
          other.createdAt == this.createdAt &&
          other.status == this.status &&
          other.error == this.error);
}

class OutboxEntriesCompanion extends UpdateCompanion<OutboxEntry> {
  final Value<String> key;
  final Value<String> message;
  final Value<int> createdAt;
  final Value<String> status;
  final Value<String?> error;
  final Value<int> rowid;
  const OutboxEntriesCompanion({
    this.key = const Value.absent(),
    this.message = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.status = const Value.absent(),
    this.error = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OutboxEntriesCompanion.insert({
    required String key,
    required String message,
    required int createdAt,
    required String status,
    this.error = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       message = Value(message),
       createdAt = Value(createdAt),
       status = Value(status);
  static Insertable<OutboxEntry> custom({
    Expression<String>? key,
    Expression<String>? message,
    Expression<int>? createdAt,
    Expression<String>? status,
    Expression<String>? error,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (message != null) 'message': message,
      if (createdAt != null) 'created_at': createdAt,
      if (status != null) 'status': status,
      if (error != null) 'error': error,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OutboxEntriesCompanion copyWith({
    Value<String>? key,
    Value<String>? message,
    Value<int>? createdAt,
    Value<String>? status,
    Value<String?>? error,
    Value<int>? rowid,
  }) {
    return OutboxEntriesCompanion(
      key: key ?? this.key,
      message: message ?? this.message,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
      error: error ?? this.error,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (message.present) {
      map['message'] = Variable<String>(message.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (error.present) {
      map['error'] = Variable<String>(error.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OutboxEntriesCompanion(')
          ..write('key: $key, ')
          ..write('message: $message, ')
          ..write('createdAt: $createdAt, ')
          ..write('status: $status, ')
          ..write('error: $error, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $KeyValuesTable extends KeyValues
    with TableInfo<$KeyValuesTable, KeyValue> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $KeyValuesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'key_values';
  @override
  VerificationContext validateIntegrity(
    Insertable<KeyValue> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  KeyValue map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return KeyValue(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
    );
  }

  @override
  $KeyValuesTable createAlias(String alias) {
    return $KeyValuesTable(attachedDatabase, alias);
  }
}

class KeyValue extends DataClass implements Insertable<KeyValue> {
  final String key;
  final String value;
  const KeyValue({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  KeyValuesCompanion toCompanion(bool nullToAbsent) {
    return KeyValuesCompanion(key: Value(key), value: Value(value));
  }

  factory KeyValue.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return KeyValue(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  KeyValue copyWith({String? key, String? value}) =>
      KeyValue(key: key ?? this.key, value: value ?? this.value);
  KeyValue copyWithCompanion(KeyValuesCompanion data) {
    return KeyValue(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('KeyValue(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is KeyValue && other.key == this.key && other.value == this.value);
}

class KeyValuesCompanion extends UpdateCompanion<KeyValue> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const KeyValuesCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  KeyValuesCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       value = Value(value);
  static Insertable<KeyValue> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  KeyValuesCompanion copyWith({
    Value<String>? key,
    Value<String>? value,
    Value<int>? rowid,
  }) {
    return KeyValuesCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('KeyValuesCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OrderLinesTable extends OrderLines
    with TableInfo<$OrderLinesTable, OrderLine> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OrderLinesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _orderIdMeta = const VerificationMeta(
    'orderId',
  );
  @override
  late final GeneratedColumn<String> orderId = GeneratedColumn<String>(
    'order_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tableIdMeta = const VerificationMeta(
    'tableId',
  );
  @override
  late final GeneratedColumn<String> tableId = GeneratedColumn<String>(
    'table_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _menuItemIdMeta = const VerificationMeta(
    'menuItemId',
  );
  @override
  late final GeneratedColumn<String> menuItemId = GeneratedColumn<String>(
    'menu_item_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameEnMeta = const VerificationMeta('nameEn');
  @override
  late final GeneratedColumn<String> nameEn = GeneratedColumn<String>(
    'name_en',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameAmMeta = const VerificationMeta('nameAm');
  @override
  late final GeneratedColumn<String> nameAm = GeneratedColumn<String>(
    'name_am',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _qtyMeta = const VerificationMeta('qty');
  @override
  late final GeneratedColumn<int> qty = GeneratedColumn<int>(
    'qty',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
    'note',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _optionsTextMeta = const VerificationMeta(
    'optionsText',
  );
  @override
  late final GeneratedColumn<String> optionsText = GeneratedColumn<String>(
    'options_text',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _priceSantimMeta = const VerificationMeta(
    'priceSantim',
  );
  @override
  late final GeneratedColumn<int> priceSantim = GeneratedColumn<int>(
    'price_santim',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _roundMeta = const VerificationMeta('round');
  @override
  late final GeneratedColumn<int> round = GeneratedColumn<int>(
    'round',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _stateMeta = const VerificationMeta('state');
  @override
  late final GeneratedColumn<String> state = GeneratedColumn<String>(
    'state',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _syncMeta = const VerificationMeta('sync');
  @override
  late final GeneratedColumn<String> sync = GeneratedColumn<String>(
    'sync',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _errorMeta = const VerificationMeta('error');
  @override
  late final GeneratedColumn<String> error = GeneratedColumn<String>(
    'error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    orderId,
    tableId,
    menuItemId,
    nameEn,
    nameAm,
    qty,
    note,
    optionsText,
    priceSantim,
    round,
    state,
    sync,
    error,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'order_lines';
  @override
  VerificationContext validateIntegrity(
    Insertable<OrderLine> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('order_id')) {
      context.handle(
        _orderIdMeta,
        orderId.isAcceptableOrUnknown(data['order_id']!, _orderIdMeta),
      );
    } else if (isInserting) {
      context.missing(_orderIdMeta);
    }
    if (data.containsKey('table_id')) {
      context.handle(
        _tableIdMeta,
        tableId.isAcceptableOrUnknown(data['table_id']!, _tableIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tableIdMeta);
    }
    if (data.containsKey('menu_item_id')) {
      context.handle(
        _menuItemIdMeta,
        menuItemId.isAcceptableOrUnknown(
          data['menu_item_id']!,
          _menuItemIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_menuItemIdMeta);
    }
    if (data.containsKey('name_en')) {
      context.handle(
        _nameEnMeta,
        nameEn.isAcceptableOrUnknown(data['name_en']!, _nameEnMeta),
      );
    } else if (isInserting) {
      context.missing(_nameEnMeta);
    }
    if (data.containsKey('name_am')) {
      context.handle(
        _nameAmMeta,
        nameAm.isAcceptableOrUnknown(data['name_am']!, _nameAmMeta),
      );
    }
    if (data.containsKey('qty')) {
      context.handle(
        _qtyMeta,
        qty.isAcceptableOrUnknown(data['qty']!, _qtyMeta),
      );
    } else if (isInserting) {
      context.missing(_qtyMeta);
    }
    if (data.containsKey('note')) {
      context.handle(
        _noteMeta,
        note.isAcceptableOrUnknown(data['note']!, _noteMeta),
      );
    }
    if (data.containsKey('options_text')) {
      context.handle(
        _optionsTextMeta,
        optionsText.isAcceptableOrUnknown(
          data['options_text']!,
          _optionsTextMeta,
        ),
      );
    }
    if (data.containsKey('price_santim')) {
      context.handle(
        _priceSantimMeta,
        priceSantim.isAcceptableOrUnknown(
          data['price_santim']!,
          _priceSantimMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_priceSantimMeta);
    }
    if (data.containsKey('round')) {
      context.handle(
        _roundMeta,
        round.isAcceptableOrUnknown(data['round']!, _roundMeta),
      );
    }
    if (data.containsKey('state')) {
      context.handle(
        _stateMeta,
        state.isAcceptableOrUnknown(data['state']!, _stateMeta),
      );
    } else if (isInserting) {
      context.missing(_stateMeta);
    }
    if (data.containsKey('sync')) {
      context.handle(
        _syncMeta,
        sync.isAcceptableOrUnknown(data['sync']!, _syncMeta),
      );
    } else if (isInserting) {
      context.missing(_syncMeta);
    }
    if (data.containsKey('error')) {
      context.handle(
        _errorMeta,
        error.isAcceptableOrUnknown(data['error']!, _errorMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  OrderLine map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OrderLine(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      orderId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}order_id'],
      )!,
      tableId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}table_id'],
      )!,
      menuItemId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}menu_item_id'],
      )!,
      nameEn: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_en'],
      )!,
      nameAm: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name_am'],
      ),
      qty: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}qty'],
      )!,
      note: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}note'],
      ),
      optionsText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}options_text'],
      ),
      priceSantim: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}price_santim'],
      )!,
      round: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}round'],
      ),
      state: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}state'],
      )!,
      sync: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync'],
      )!,
      error: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}error'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $OrderLinesTable createAlias(String alias) {
    return $OrderLinesTable(attachedDatabase, alias);
  }
}

class OrderLine extends DataClass implements Insertable<OrderLine> {
  /// The item id (UUID v7 made on the tablet).
  final String id;
  final String orderId;
  final String tableId;
  final String menuItemId;
  final String nameEn;
  final String? nameAm;
  final int qty;
  final String? note;

  /// Chosen options for display, e.g. "Large, Honey".
  final String? optionsText;

  /// Unit price incl. options, for DISPLAY only; the server's price counts (D-17).
  final int priceSantim;

  /// Round number from the server; null until the round is confirmed.
  final int? round;

  /// sent, accepted, ready, delivered, cancelled, voided (the server's item state).
  final String state;

  /// queued, sending, sent, needs_attention: has the server got it? (not an order state)
  final String sync;
  final String? error;
  final int createdAt;
  const OrderLine({
    required this.id,
    required this.orderId,
    required this.tableId,
    required this.menuItemId,
    required this.nameEn,
    this.nameAm,
    required this.qty,
    this.note,
    this.optionsText,
    required this.priceSantim,
    this.round,
    required this.state,
    required this.sync,
    this.error,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['order_id'] = Variable<String>(orderId);
    map['table_id'] = Variable<String>(tableId);
    map['menu_item_id'] = Variable<String>(menuItemId);
    map['name_en'] = Variable<String>(nameEn);
    if (!nullToAbsent || nameAm != null) {
      map['name_am'] = Variable<String>(nameAm);
    }
    map['qty'] = Variable<int>(qty);
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    if (!nullToAbsent || optionsText != null) {
      map['options_text'] = Variable<String>(optionsText);
    }
    map['price_santim'] = Variable<int>(priceSantim);
    if (!nullToAbsent || round != null) {
      map['round'] = Variable<int>(round);
    }
    map['state'] = Variable<String>(state);
    map['sync'] = Variable<String>(sync);
    if (!nullToAbsent || error != null) {
      map['error'] = Variable<String>(error);
    }
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  OrderLinesCompanion toCompanion(bool nullToAbsent) {
    return OrderLinesCompanion(
      id: Value(id),
      orderId: Value(orderId),
      tableId: Value(tableId),
      menuItemId: Value(menuItemId),
      nameEn: Value(nameEn),
      nameAm: nameAm == null && nullToAbsent
          ? const Value.absent()
          : Value(nameAm),
      qty: Value(qty),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      optionsText: optionsText == null && nullToAbsent
          ? const Value.absent()
          : Value(optionsText),
      priceSantim: Value(priceSantim),
      round: round == null && nullToAbsent
          ? const Value.absent()
          : Value(round),
      state: Value(state),
      sync: Value(sync),
      error: error == null && nullToAbsent
          ? const Value.absent()
          : Value(error),
      createdAt: Value(createdAt),
    );
  }

  factory OrderLine.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OrderLine(
      id: serializer.fromJson<String>(json['id']),
      orderId: serializer.fromJson<String>(json['orderId']),
      tableId: serializer.fromJson<String>(json['tableId']),
      menuItemId: serializer.fromJson<String>(json['menuItemId']),
      nameEn: serializer.fromJson<String>(json['nameEn']),
      nameAm: serializer.fromJson<String?>(json['nameAm']),
      qty: serializer.fromJson<int>(json['qty']),
      note: serializer.fromJson<String?>(json['note']),
      optionsText: serializer.fromJson<String?>(json['optionsText']),
      priceSantim: serializer.fromJson<int>(json['priceSantim']),
      round: serializer.fromJson<int?>(json['round']),
      state: serializer.fromJson<String>(json['state']),
      sync: serializer.fromJson<String>(json['sync']),
      error: serializer.fromJson<String?>(json['error']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'orderId': serializer.toJson<String>(orderId),
      'tableId': serializer.toJson<String>(tableId),
      'menuItemId': serializer.toJson<String>(menuItemId),
      'nameEn': serializer.toJson<String>(nameEn),
      'nameAm': serializer.toJson<String?>(nameAm),
      'qty': serializer.toJson<int>(qty),
      'note': serializer.toJson<String?>(note),
      'optionsText': serializer.toJson<String?>(optionsText),
      'priceSantim': serializer.toJson<int>(priceSantim),
      'round': serializer.toJson<int?>(round),
      'state': serializer.toJson<String>(state),
      'sync': serializer.toJson<String>(sync),
      'error': serializer.toJson<String?>(error),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  OrderLine copyWith({
    String? id,
    String? orderId,
    String? tableId,
    String? menuItemId,
    String? nameEn,
    Value<String?> nameAm = const Value.absent(),
    int? qty,
    Value<String?> note = const Value.absent(),
    Value<String?> optionsText = const Value.absent(),
    int? priceSantim,
    Value<int?> round = const Value.absent(),
    String? state,
    String? sync,
    Value<String?> error = const Value.absent(),
    int? createdAt,
  }) => OrderLine(
    id: id ?? this.id,
    orderId: orderId ?? this.orderId,
    tableId: tableId ?? this.tableId,
    menuItemId: menuItemId ?? this.menuItemId,
    nameEn: nameEn ?? this.nameEn,
    nameAm: nameAm.present ? nameAm.value : this.nameAm,
    qty: qty ?? this.qty,
    note: note.present ? note.value : this.note,
    optionsText: optionsText.present ? optionsText.value : this.optionsText,
    priceSantim: priceSantim ?? this.priceSantim,
    round: round.present ? round.value : this.round,
    state: state ?? this.state,
    sync: sync ?? this.sync,
    error: error.present ? error.value : this.error,
    createdAt: createdAt ?? this.createdAt,
  );
  OrderLine copyWithCompanion(OrderLinesCompanion data) {
    return OrderLine(
      id: data.id.present ? data.id.value : this.id,
      orderId: data.orderId.present ? data.orderId.value : this.orderId,
      tableId: data.tableId.present ? data.tableId.value : this.tableId,
      menuItemId: data.menuItemId.present
          ? data.menuItemId.value
          : this.menuItemId,
      nameEn: data.nameEn.present ? data.nameEn.value : this.nameEn,
      nameAm: data.nameAm.present ? data.nameAm.value : this.nameAm,
      qty: data.qty.present ? data.qty.value : this.qty,
      note: data.note.present ? data.note.value : this.note,
      optionsText: data.optionsText.present
          ? data.optionsText.value
          : this.optionsText,
      priceSantim: data.priceSantim.present
          ? data.priceSantim.value
          : this.priceSantim,
      round: data.round.present ? data.round.value : this.round,
      state: data.state.present ? data.state.value : this.state,
      sync: data.sync.present ? data.sync.value : this.sync,
      error: data.error.present ? data.error.value : this.error,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OrderLine(')
          ..write('id: $id, ')
          ..write('orderId: $orderId, ')
          ..write('tableId: $tableId, ')
          ..write('menuItemId: $menuItemId, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('qty: $qty, ')
          ..write('note: $note, ')
          ..write('optionsText: $optionsText, ')
          ..write('priceSantim: $priceSantim, ')
          ..write('round: $round, ')
          ..write('state: $state, ')
          ..write('sync: $sync, ')
          ..write('error: $error, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    orderId,
    tableId,
    menuItemId,
    nameEn,
    nameAm,
    qty,
    note,
    optionsText,
    priceSantim,
    round,
    state,
    sync,
    error,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OrderLine &&
          other.id == this.id &&
          other.orderId == this.orderId &&
          other.tableId == this.tableId &&
          other.menuItemId == this.menuItemId &&
          other.nameEn == this.nameEn &&
          other.nameAm == this.nameAm &&
          other.qty == this.qty &&
          other.note == this.note &&
          other.optionsText == this.optionsText &&
          other.priceSantim == this.priceSantim &&
          other.round == this.round &&
          other.state == this.state &&
          other.sync == this.sync &&
          other.error == this.error &&
          other.createdAt == this.createdAt);
}

class OrderLinesCompanion extends UpdateCompanion<OrderLine> {
  final Value<String> id;
  final Value<String> orderId;
  final Value<String> tableId;
  final Value<String> menuItemId;
  final Value<String> nameEn;
  final Value<String?> nameAm;
  final Value<int> qty;
  final Value<String?> note;
  final Value<String?> optionsText;
  final Value<int> priceSantim;
  final Value<int?> round;
  final Value<String> state;
  final Value<String> sync;
  final Value<String?> error;
  final Value<int> createdAt;
  final Value<int> rowid;
  const OrderLinesCompanion({
    this.id = const Value.absent(),
    this.orderId = const Value.absent(),
    this.tableId = const Value.absent(),
    this.menuItemId = const Value.absent(),
    this.nameEn = const Value.absent(),
    this.nameAm = const Value.absent(),
    this.qty = const Value.absent(),
    this.note = const Value.absent(),
    this.optionsText = const Value.absent(),
    this.priceSantim = const Value.absent(),
    this.round = const Value.absent(),
    this.state = const Value.absent(),
    this.sync = const Value.absent(),
    this.error = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OrderLinesCompanion.insert({
    required String id,
    required String orderId,
    required String tableId,
    required String menuItemId,
    required String nameEn,
    this.nameAm = const Value.absent(),
    required int qty,
    this.note = const Value.absent(),
    this.optionsText = const Value.absent(),
    required int priceSantim,
    this.round = const Value.absent(),
    required String state,
    required String sync,
    this.error = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       orderId = Value(orderId),
       tableId = Value(tableId),
       menuItemId = Value(menuItemId),
       nameEn = Value(nameEn),
       qty = Value(qty),
       priceSantim = Value(priceSantim),
       state = Value(state),
       sync = Value(sync),
       createdAt = Value(createdAt);
  static Insertable<OrderLine> custom({
    Expression<String>? id,
    Expression<String>? orderId,
    Expression<String>? tableId,
    Expression<String>? menuItemId,
    Expression<String>? nameEn,
    Expression<String>? nameAm,
    Expression<int>? qty,
    Expression<String>? note,
    Expression<String>? optionsText,
    Expression<int>? priceSantim,
    Expression<int>? round,
    Expression<String>? state,
    Expression<String>? sync,
    Expression<String>? error,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (orderId != null) 'order_id': orderId,
      if (tableId != null) 'table_id': tableId,
      if (menuItemId != null) 'menu_item_id': menuItemId,
      if (nameEn != null) 'name_en': nameEn,
      if (nameAm != null) 'name_am': nameAm,
      if (qty != null) 'qty': qty,
      if (note != null) 'note': note,
      if (optionsText != null) 'options_text': optionsText,
      if (priceSantim != null) 'price_santim': priceSantim,
      if (round != null) 'round': round,
      if (state != null) 'state': state,
      if (sync != null) 'sync': sync,
      if (error != null) 'error': error,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OrderLinesCompanion copyWith({
    Value<String>? id,
    Value<String>? orderId,
    Value<String>? tableId,
    Value<String>? menuItemId,
    Value<String>? nameEn,
    Value<String?>? nameAm,
    Value<int>? qty,
    Value<String?>? note,
    Value<String?>? optionsText,
    Value<int>? priceSantim,
    Value<int?>? round,
    Value<String>? state,
    Value<String>? sync,
    Value<String?>? error,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return OrderLinesCompanion(
      id: id ?? this.id,
      orderId: orderId ?? this.orderId,
      tableId: tableId ?? this.tableId,
      menuItemId: menuItemId ?? this.menuItemId,
      nameEn: nameEn ?? this.nameEn,
      nameAm: nameAm ?? this.nameAm,
      qty: qty ?? this.qty,
      note: note ?? this.note,
      optionsText: optionsText ?? this.optionsText,
      priceSantim: priceSantim ?? this.priceSantim,
      round: round ?? this.round,
      state: state ?? this.state,
      sync: sync ?? this.sync,
      error: error ?? this.error,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (orderId.present) {
      map['order_id'] = Variable<String>(orderId.value);
    }
    if (tableId.present) {
      map['table_id'] = Variable<String>(tableId.value);
    }
    if (menuItemId.present) {
      map['menu_item_id'] = Variable<String>(menuItemId.value);
    }
    if (nameEn.present) {
      map['name_en'] = Variable<String>(nameEn.value);
    }
    if (nameAm.present) {
      map['name_am'] = Variable<String>(nameAm.value);
    }
    if (qty.present) {
      map['qty'] = Variable<int>(qty.value);
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (optionsText.present) {
      map['options_text'] = Variable<String>(optionsText.value);
    }
    if (priceSantim.present) {
      map['price_santim'] = Variable<int>(priceSantim.value);
    }
    if (round.present) {
      map['round'] = Variable<int>(round.value);
    }
    if (state.present) {
      map['state'] = Variable<String>(state.value);
    }
    if (sync.present) {
      map['sync'] = Variable<String>(sync.value);
    }
    if (error.present) {
      map['error'] = Variable<String>(error.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OrderLinesCompanion(')
          ..write('id: $id, ')
          ..write('orderId: $orderId, ')
          ..write('tableId: $tableId, ')
          ..write('menuItemId: $menuItemId, ')
          ..write('nameEn: $nameEn, ')
          ..write('nameAm: $nameAm, ')
          ..write('qty: $qty, ')
          ..write('note: $note, ')
          ..write('optionsText: $optionsText, ')
          ..write('priceSantim: $priceSantim, ')
          ..write('round: $round, ')
          ..write('state: $state, ')
          ..write('sync: $sync, ')
          ..write('error: $error, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $CategoriesTable categories = $CategoriesTable(this);
  late final $MenuItemsTable menuItems = $MenuItemsTable(this);
  late final $OptionGroupsTable optionGroups = $OptionGroupsTable(this);
  late final $OptionChoicesTable optionChoices = $OptionChoicesTable(this);
  late final $CafeTablesTable cafeTables = $CafeTablesTable(this);
  late final $OutboxEntriesTable outboxEntries = $OutboxEntriesTable(this);
  late final $KeyValuesTable keyValues = $KeyValuesTable(this);
  late final $OrderLinesTable orderLines = $OrderLinesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    categories,
    menuItems,
    optionGroups,
    optionChoices,
    cafeTables,
    outboxEntries,
    keyValues,
    orderLines,
  ];
}

typedef $$CategoriesTableCreateCompanionBuilder =
    CategoriesCompanion Function({
      required String id,
      required String nameEn,
      Value<String?> nameAm,
      required int sortOrder,
      Value<int> rowid,
    });
typedef $$CategoriesTableUpdateCompanionBuilder =
    CategoriesCompanion Function({
      Value<String> id,
      Value<String> nameEn,
      Value<String?> nameAm,
      Value<int> sortOrder,
      Value<int> rowid,
    });

class $$CategoriesTableFilterComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CategoriesTableOrderingComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CategoriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get nameEn =>
      $composableBuilder(column: $table.nameEn, builder: (column) => column);

  GeneratedColumn<String> get nameAm =>
      $composableBuilder(column: $table.nameAm, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);
}

class $$CategoriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CategoriesTable,
          Category,
          $$CategoriesTableFilterComposer,
          $$CategoriesTableOrderingComposer,
          $$CategoriesTableAnnotationComposer,
          $$CategoriesTableCreateCompanionBuilder,
          $$CategoriesTableUpdateCompanionBuilder,
          (Category, BaseReferences<_$AppDatabase, $CategoriesTable, Category>),
          Category,
          PrefetchHooks Function()
        > {
  $$CategoriesTableTableManager(_$AppDatabase db, $CategoriesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CategoriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CategoriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CategoriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> nameEn = const Value.absent(),
                Value<String?> nameAm = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoriesCompanion(
                id: id,
                nameEn: nameEn,
                nameAm: nameAm,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String nameEn,
                Value<String?> nameAm = const Value.absent(),
                required int sortOrder,
                Value<int> rowid = const Value.absent(),
              }) => CategoriesCompanion.insert(
                id: id,
                nameEn: nameEn,
                nameAm: nameAm,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CategoriesTable, Category>(table),
                  BaseReferences<_$AppDatabase, $CategoriesTable, Category>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CategoriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CategoriesTable,
      Category,
      $$CategoriesTableFilterComposer,
      $$CategoriesTableOrderingComposer,
      $$CategoriesTableAnnotationComposer,
      $$CategoriesTableCreateCompanionBuilder,
      $$CategoriesTableUpdateCompanionBuilder,
      (Category, BaseReferences<_$AppDatabase, $CategoriesTable, Category>),
      Category,
      PrefetchHooks Function()
    >;
typedef $$MenuItemsTableCreateCompanionBuilder =
    MenuItemsCompanion Function({
      required String id,
      Value<String?> categoryId,
      required String nameEn,
      Value<String?> nameAm,
      required int priceSantim,
      required String stationId,
      required bool fasting,
      required bool soldOut,
      required int sortOrder,
      required String optionGroupIds,
      Value<int> rowid,
    });
typedef $$MenuItemsTableUpdateCompanionBuilder =
    MenuItemsCompanion Function({
      Value<String> id,
      Value<String?> categoryId,
      Value<String> nameEn,
      Value<String?> nameAm,
      Value<int> priceSantim,
      Value<String> stationId,
      Value<bool> fasting,
      Value<bool> soldOut,
      Value<int> sortOrder,
      Value<String> optionGroupIds,
      Value<int> rowid,
    });

class $$MenuItemsTableFilterComposer
    extends Composer<_$AppDatabase, $MenuItemsTable> {
  $$MenuItemsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get priceSantim => $composableBuilder(
    column: $table.priceSantim,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get stationId => $composableBuilder(
    column: $table.stationId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get fasting => $composableBuilder(
    column: $table.fasting,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get soldOut => $composableBuilder(
    column: $table.soldOut,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get optionGroupIds => $composableBuilder(
    column: $table.optionGroupIds,
    builder: (column) => ColumnFilters(column),
  );
}

class $$MenuItemsTableOrderingComposer
    extends Composer<_$AppDatabase, $MenuItemsTable> {
  $$MenuItemsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get priceSantim => $composableBuilder(
    column: $table.priceSantim,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get stationId => $composableBuilder(
    column: $table.stationId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get fasting => $composableBuilder(
    column: $table.fasting,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get soldOut => $composableBuilder(
    column: $table.soldOut,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get optionGroupIds => $composableBuilder(
    column: $table.optionGroupIds,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$MenuItemsTableAnnotationComposer
    extends Composer<_$AppDatabase, $MenuItemsTable> {
  $$MenuItemsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get nameEn =>
      $composableBuilder(column: $table.nameEn, builder: (column) => column);

  GeneratedColumn<String> get nameAm =>
      $composableBuilder(column: $table.nameAm, builder: (column) => column);

  GeneratedColumn<int> get priceSantim => $composableBuilder(
    column: $table.priceSantim,
    builder: (column) => column,
  );

  GeneratedColumn<String> get stationId =>
      $composableBuilder(column: $table.stationId, builder: (column) => column);

  GeneratedColumn<bool> get fasting =>
      $composableBuilder(column: $table.fasting, builder: (column) => column);

  GeneratedColumn<bool> get soldOut =>
      $composableBuilder(column: $table.soldOut, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<String> get optionGroupIds => $composableBuilder(
    column: $table.optionGroupIds,
    builder: (column) => column,
  );
}

class $$MenuItemsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $MenuItemsTable,
          MenuItem,
          $$MenuItemsTableFilterComposer,
          $$MenuItemsTableOrderingComposer,
          $$MenuItemsTableAnnotationComposer,
          $$MenuItemsTableCreateCompanionBuilder,
          $$MenuItemsTableUpdateCompanionBuilder,
          (MenuItem, BaseReferences<_$AppDatabase, $MenuItemsTable, MenuItem>),
          MenuItem,
          PrefetchHooks Function()
        > {
  $$MenuItemsTableTableManager(_$AppDatabase db, $MenuItemsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MenuItemsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MenuItemsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MenuItemsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String?> categoryId = const Value.absent(),
                Value<String> nameEn = const Value.absent(),
                Value<String?> nameAm = const Value.absent(),
                Value<int> priceSantim = const Value.absent(),
                Value<String> stationId = const Value.absent(),
                Value<bool> fasting = const Value.absent(),
                Value<bool> soldOut = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<String> optionGroupIds = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MenuItemsCompanion(
                id: id,
                categoryId: categoryId,
                nameEn: nameEn,
                nameAm: nameAm,
                priceSantim: priceSantim,
                stationId: stationId,
                fasting: fasting,
                soldOut: soldOut,
                sortOrder: sortOrder,
                optionGroupIds: optionGroupIds,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> categoryId = const Value.absent(),
                required String nameEn,
                Value<String?> nameAm = const Value.absent(),
                required int priceSantim,
                required String stationId,
                required bool fasting,
                required bool soldOut,
                required int sortOrder,
                required String optionGroupIds,
                Value<int> rowid = const Value.absent(),
              }) => MenuItemsCompanion.insert(
                id: id,
                categoryId: categoryId,
                nameEn: nameEn,
                nameAm: nameAm,
                priceSantim: priceSantim,
                stationId: stationId,
                fasting: fasting,
                soldOut: soldOut,
                sortOrder: sortOrder,
                optionGroupIds: optionGroupIds,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$MenuItemsTable, MenuItem>(table),
                  BaseReferences<_$AppDatabase, $MenuItemsTable, MenuItem>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$MenuItemsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $MenuItemsTable,
      MenuItem,
      $$MenuItemsTableFilterComposer,
      $$MenuItemsTableOrderingComposer,
      $$MenuItemsTableAnnotationComposer,
      $$MenuItemsTableCreateCompanionBuilder,
      $$MenuItemsTableUpdateCompanionBuilder,
      (MenuItem, BaseReferences<_$AppDatabase, $MenuItemsTable, MenuItem>),
      MenuItem,
      PrefetchHooks Function()
    >;
typedef $$OptionGroupsTableCreateCompanionBuilder =
    OptionGroupsCompanion Function({
      required String id,
      required String nameEn,
      Value<String?> nameAm,
      required int minChoices,
      required int maxChoices,
      required int sortOrder,
      Value<int> rowid,
    });
typedef $$OptionGroupsTableUpdateCompanionBuilder =
    OptionGroupsCompanion Function({
      Value<String> id,
      Value<String> nameEn,
      Value<String?> nameAm,
      Value<int> minChoices,
      Value<int> maxChoices,
      Value<int> sortOrder,
      Value<int> rowid,
    });

class $$OptionGroupsTableFilterComposer
    extends Composer<_$AppDatabase, $OptionGroupsTable> {
  $$OptionGroupsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get minChoices => $composableBuilder(
    column: $table.minChoices,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get maxChoices => $composableBuilder(
    column: $table.maxChoices,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OptionGroupsTableOrderingComposer
    extends Composer<_$AppDatabase, $OptionGroupsTable> {
  $$OptionGroupsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get minChoices => $composableBuilder(
    column: $table.minChoices,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get maxChoices => $composableBuilder(
    column: $table.maxChoices,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OptionGroupsTableAnnotationComposer
    extends Composer<_$AppDatabase, $OptionGroupsTable> {
  $$OptionGroupsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get nameEn =>
      $composableBuilder(column: $table.nameEn, builder: (column) => column);

  GeneratedColumn<String> get nameAm =>
      $composableBuilder(column: $table.nameAm, builder: (column) => column);

  GeneratedColumn<int> get minChoices => $composableBuilder(
    column: $table.minChoices,
    builder: (column) => column,
  );

  GeneratedColumn<int> get maxChoices => $composableBuilder(
    column: $table.maxChoices,
    builder: (column) => column,
  );

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);
}

class $$OptionGroupsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OptionGroupsTable,
          OptionGroup,
          $$OptionGroupsTableFilterComposer,
          $$OptionGroupsTableOrderingComposer,
          $$OptionGroupsTableAnnotationComposer,
          $$OptionGroupsTableCreateCompanionBuilder,
          $$OptionGroupsTableUpdateCompanionBuilder,
          (
            OptionGroup,
            BaseReferences<_$AppDatabase, $OptionGroupsTable, OptionGroup>,
          ),
          OptionGroup,
          PrefetchHooks Function()
        > {
  $$OptionGroupsTableTableManager(_$AppDatabase db, $OptionGroupsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OptionGroupsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OptionGroupsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OptionGroupsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> nameEn = const Value.absent(),
                Value<String?> nameAm = const Value.absent(),
                Value<int> minChoices = const Value.absent(),
                Value<int> maxChoices = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OptionGroupsCompanion(
                id: id,
                nameEn: nameEn,
                nameAm: nameAm,
                minChoices: minChoices,
                maxChoices: maxChoices,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String nameEn,
                Value<String?> nameAm = const Value.absent(),
                required int minChoices,
                required int maxChoices,
                required int sortOrder,
                Value<int> rowid = const Value.absent(),
              }) => OptionGroupsCompanion.insert(
                id: id,
                nameEn: nameEn,
                nameAm: nameAm,
                minChoices: minChoices,
                maxChoices: maxChoices,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OptionGroupsTable, OptionGroup>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $OptionGroupsTable,
                    OptionGroup
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OptionGroupsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OptionGroupsTable,
      OptionGroup,
      $$OptionGroupsTableFilterComposer,
      $$OptionGroupsTableOrderingComposer,
      $$OptionGroupsTableAnnotationComposer,
      $$OptionGroupsTableCreateCompanionBuilder,
      $$OptionGroupsTableUpdateCompanionBuilder,
      (
        OptionGroup,
        BaseReferences<_$AppDatabase, $OptionGroupsTable, OptionGroup>,
      ),
      OptionGroup,
      PrefetchHooks Function()
    >;
typedef $$OptionChoicesTableCreateCompanionBuilder =
    OptionChoicesCompanion Function({
      required String id,
      required String groupId,
      required String nameEn,
      Value<String?> nameAm,
      required int extraSantim,
      required int sortOrder,
      Value<int> rowid,
    });
typedef $$OptionChoicesTableUpdateCompanionBuilder =
    OptionChoicesCompanion Function({
      Value<String> id,
      Value<String> groupId,
      Value<String> nameEn,
      Value<String?> nameAm,
      Value<int> extraSantim,
      Value<int> sortOrder,
      Value<int> rowid,
    });

class $$OptionChoicesTableFilterComposer
    extends Composer<_$AppDatabase, $OptionChoicesTable> {
  $$OptionChoicesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get groupId => $composableBuilder(
    column: $table.groupId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get extraSantim => $composableBuilder(
    column: $table.extraSantim,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OptionChoicesTableOrderingComposer
    extends Composer<_$AppDatabase, $OptionChoicesTable> {
  $$OptionChoicesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get groupId => $composableBuilder(
    column: $table.groupId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get extraSantim => $composableBuilder(
    column: $table.extraSantim,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OptionChoicesTableAnnotationComposer
    extends Composer<_$AppDatabase, $OptionChoicesTable> {
  $$OptionChoicesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get groupId =>
      $composableBuilder(column: $table.groupId, builder: (column) => column);

  GeneratedColumn<String> get nameEn =>
      $composableBuilder(column: $table.nameEn, builder: (column) => column);

  GeneratedColumn<String> get nameAm =>
      $composableBuilder(column: $table.nameAm, builder: (column) => column);

  GeneratedColumn<int> get extraSantim => $composableBuilder(
    column: $table.extraSantim,
    builder: (column) => column,
  );

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);
}

class $$OptionChoicesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OptionChoicesTable,
          OptionChoice,
          $$OptionChoicesTableFilterComposer,
          $$OptionChoicesTableOrderingComposer,
          $$OptionChoicesTableAnnotationComposer,
          $$OptionChoicesTableCreateCompanionBuilder,
          $$OptionChoicesTableUpdateCompanionBuilder,
          (
            OptionChoice,
            BaseReferences<_$AppDatabase, $OptionChoicesTable, OptionChoice>,
          ),
          OptionChoice,
          PrefetchHooks Function()
        > {
  $$OptionChoicesTableTableManager(_$AppDatabase db, $OptionChoicesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OptionChoicesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OptionChoicesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OptionChoicesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> groupId = const Value.absent(),
                Value<String> nameEn = const Value.absent(),
                Value<String?> nameAm = const Value.absent(),
                Value<int> extraSantim = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OptionChoicesCompanion(
                id: id,
                groupId: groupId,
                nameEn: nameEn,
                nameAm: nameAm,
                extraSantim: extraSantim,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String groupId,
                required String nameEn,
                Value<String?> nameAm = const Value.absent(),
                required int extraSantim,
                required int sortOrder,
                Value<int> rowid = const Value.absent(),
              }) => OptionChoicesCompanion.insert(
                id: id,
                groupId: groupId,
                nameEn: nameEn,
                nameAm: nameAm,
                extraSantim: extraSantim,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OptionChoicesTable, OptionChoice>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $OptionChoicesTable,
                    OptionChoice
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OptionChoicesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OptionChoicesTable,
      OptionChoice,
      $$OptionChoicesTableFilterComposer,
      $$OptionChoicesTableOrderingComposer,
      $$OptionChoicesTableAnnotationComposer,
      $$OptionChoicesTableCreateCompanionBuilder,
      $$OptionChoicesTableUpdateCompanionBuilder,
      (
        OptionChoice,
        BaseReferences<_$AppDatabase, $OptionChoicesTable, OptionChoice>,
      ),
      OptionChoice,
      PrefetchHooks Function()
    >;
typedef $$CafeTablesTableCreateCompanionBuilder =
    CafeTablesCompanion Function({
      required String id,
      required String name,
      Value<String?> area,
      Value<int?> seats,
      required int sortOrder,
      required String state,
      Value<String?> sessionId,
      Value<String?> waiterId,
      Value<int> rowid,
    });
typedef $$CafeTablesTableUpdateCompanionBuilder =
    CafeTablesCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<String?> area,
      Value<int?> seats,
      Value<int> sortOrder,
      Value<String> state,
      Value<String?> sessionId,
      Value<String?> waiterId,
      Value<int> rowid,
    });

class $$CafeTablesTableFilterComposer
    extends Composer<_$AppDatabase, $CafeTablesTable> {
  $$CafeTablesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get area => $composableBuilder(
    column: $table.area,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get seats => $composableBuilder(
    column: $table.seats,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sessionId => $composableBuilder(
    column: $table.sessionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get waiterId => $composableBuilder(
    column: $table.waiterId,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CafeTablesTableOrderingComposer
    extends Composer<_$AppDatabase, $CafeTablesTable> {
  $$CafeTablesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get area => $composableBuilder(
    column: $table.area,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get seats => $composableBuilder(
    column: $table.seats,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sessionId => $composableBuilder(
    column: $table.sessionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get waiterId => $composableBuilder(
    column: $table.waiterId,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CafeTablesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CafeTablesTable> {
  $$CafeTablesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get area =>
      $composableBuilder(column: $table.area, builder: (column) => column);

  GeneratedColumn<int> get seats =>
      $composableBuilder(column: $table.seats, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<String> get state =>
      $composableBuilder(column: $table.state, builder: (column) => column);

  GeneratedColumn<String> get sessionId =>
      $composableBuilder(column: $table.sessionId, builder: (column) => column);

  GeneratedColumn<String> get waiterId =>
      $composableBuilder(column: $table.waiterId, builder: (column) => column);
}

class $$CafeTablesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CafeTablesTable,
          CafeTable,
          $$CafeTablesTableFilterComposer,
          $$CafeTablesTableOrderingComposer,
          $$CafeTablesTableAnnotationComposer,
          $$CafeTablesTableCreateCompanionBuilder,
          $$CafeTablesTableUpdateCompanionBuilder,
          (
            CafeTable,
            BaseReferences<_$AppDatabase, $CafeTablesTable, CafeTable>,
          ),
          CafeTable,
          PrefetchHooks Function()
        > {
  $$CafeTablesTableTableManager(_$AppDatabase db, $CafeTablesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CafeTablesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CafeTablesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CafeTablesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String?> area = const Value.absent(),
                Value<int?> seats = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<String> state = const Value.absent(),
                Value<String?> sessionId = const Value.absent(),
                Value<String?> waiterId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CafeTablesCompanion(
                id: id,
                name: name,
                area: area,
                seats: seats,
                sortOrder: sortOrder,
                state: state,
                sessionId: sessionId,
                waiterId: waiterId,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<String?> area = const Value.absent(),
                Value<int?> seats = const Value.absent(),
                required int sortOrder,
                required String state,
                Value<String?> sessionId = const Value.absent(),
                Value<String?> waiterId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CafeTablesCompanion.insert(
                id: id,
                name: name,
                area: area,
                seats: seats,
                sortOrder: sortOrder,
                state: state,
                sessionId: sessionId,
                waiterId: waiterId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CafeTablesTable, CafeTable>(table),
                  BaseReferences<_$AppDatabase, $CafeTablesTable, CafeTable>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CafeTablesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CafeTablesTable,
      CafeTable,
      $$CafeTablesTableFilterComposer,
      $$CafeTablesTableOrderingComposer,
      $$CafeTablesTableAnnotationComposer,
      $$CafeTablesTableCreateCompanionBuilder,
      $$CafeTablesTableUpdateCompanionBuilder,
      (CafeTable, BaseReferences<_$AppDatabase, $CafeTablesTable, CafeTable>),
      CafeTable,
      PrefetchHooks Function()
    >;
typedef $$OutboxEntriesTableCreateCompanionBuilder =
    OutboxEntriesCompanion Function({
      required String key,
      required String message,
      required int createdAt,
      required String status,
      Value<String?> error,
      Value<int> rowid,
    });
typedef $$OutboxEntriesTableUpdateCompanionBuilder =
    OutboxEntriesCompanion Function({
      Value<String> key,
      Value<String> message,
      Value<int> createdAt,
      Value<String> status,
      Value<String?> error,
      Value<int> rowid,
    });

class $$OutboxEntriesTableFilterComposer
    extends Composer<_$AppDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get message => $composableBuilder(
    column: $table.message,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get error => $composableBuilder(
    column: $table.error,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OutboxEntriesTableOrderingComposer
    extends Composer<_$AppDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get message => $composableBuilder(
    column: $table.message,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get error => $composableBuilder(
    column: $table.error,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OutboxEntriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get message =>
      $composableBuilder(column: $table.message, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get error =>
      $composableBuilder(column: $table.error, builder: (column) => column);
}

class $$OutboxEntriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OutboxEntriesTable,
          OutboxEntry,
          $$OutboxEntriesTableFilterComposer,
          $$OutboxEntriesTableOrderingComposer,
          $$OutboxEntriesTableAnnotationComposer,
          $$OutboxEntriesTableCreateCompanionBuilder,
          $$OutboxEntriesTableUpdateCompanionBuilder,
          (
            OutboxEntry,
            BaseReferences<_$AppDatabase, $OutboxEntriesTable, OutboxEntry>,
          ),
          OutboxEntry,
          PrefetchHooks Function()
        > {
  $$OutboxEntriesTableTableManager(_$AppDatabase db, $OutboxEntriesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OutboxEntriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OutboxEntriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OutboxEntriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> message = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> error = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OutboxEntriesCompanion(
                key: key,
                message: message,
                createdAt: createdAt,
                status: status,
                error: error,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String key,
                required String message,
                required int createdAt,
                required String status,
                Value<String?> error = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OutboxEntriesCompanion.insert(
                key: key,
                message: message,
                createdAt: createdAt,
                status: status,
                error: error,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OutboxEntriesTable, OutboxEntry>(table),
                  BaseReferences<
                    _$AppDatabase,
                    $OutboxEntriesTable,
                    OutboxEntry
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OutboxEntriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OutboxEntriesTable,
      OutboxEntry,
      $$OutboxEntriesTableFilterComposer,
      $$OutboxEntriesTableOrderingComposer,
      $$OutboxEntriesTableAnnotationComposer,
      $$OutboxEntriesTableCreateCompanionBuilder,
      $$OutboxEntriesTableUpdateCompanionBuilder,
      (
        OutboxEntry,
        BaseReferences<_$AppDatabase, $OutboxEntriesTable, OutboxEntry>,
      ),
      OutboxEntry,
      PrefetchHooks Function()
    >;
typedef $$KeyValuesTableCreateCompanionBuilder =
    KeyValuesCompanion Function({
      required String key,
      required String value,
      Value<int> rowid,
    });
typedef $$KeyValuesTableUpdateCompanionBuilder =
    KeyValuesCompanion Function({
      Value<String> key,
      Value<String> value,
      Value<int> rowid,
    });

class $$KeyValuesTableFilterComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$KeyValuesTableOrderingComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$KeyValuesTableAnnotationComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$KeyValuesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $KeyValuesTable,
          KeyValue,
          $$KeyValuesTableFilterComposer,
          $$KeyValuesTableOrderingComposer,
          $$KeyValuesTableAnnotationComposer,
          $$KeyValuesTableCreateCompanionBuilder,
          $$KeyValuesTableUpdateCompanionBuilder,
          (KeyValue, BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>),
          KeyValue,
          PrefetchHooks Function()
        > {
  $$KeyValuesTableTableManager(_$AppDatabase db, $KeyValuesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$KeyValuesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$KeyValuesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$KeyValuesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> value = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => KeyValuesCompanion(key: key, value: value, rowid: rowid),
          createCompanionCallback:
              ({
                required String key,
                required String value,
                Value<int> rowid = const Value.absent(),
              }) => KeyValuesCompanion.insert(
                key: key,
                value: value,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$KeyValuesTable, KeyValue>(table),
                  BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$KeyValuesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $KeyValuesTable,
      KeyValue,
      $$KeyValuesTableFilterComposer,
      $$KeyValuesTableOrderingComposer,
      $$KeyValuesTableAnnotationComposer,
      $$KeyValuesTableCreateCompanionBuilder,
      $$KeyValuesTableUpdateCompanionBuilder,
      (KeyValue, BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>),
      KeyValue,
      PrefetchHooks Function()
    >;
typedef $$OrderLinesTableCreateCompanionBuilder =
    OrderLinesCompanion Function({
      required String id,
      required String orderId,
      required String tableId,
      required String menuItemId,
      required String nameEn,
      Value<String?> nameAm,
      required int qty,
      Value<String?> note,
      Value<String?> optionsText,
      required int priceSantim,
      Value<int?> round,
      required String state,
      required String sync,
      Value<String?> error,
      required int createdAt,
      Value<int> rowid,
    });
typedef $$OrderLinesTableUpdateCompanionBuilder =
    OrderLinesCompanion Function({
      Value<String> id,
      Value<String> orderId,
      Value<String> tableId,
      Value<String> menuItemId,
      Value<String> nameEn,
      Value<String?> nameAm,
      Value<int> qty,
      Value<String?> note,
      Value<String?> optionsText,
      Value<int> priceSantim,
      Value<int?> round,
      Value<String> state,
      Value<String> sync,
      Value<String?> error,
      Value<int> createdAt,
      Value<int> rowid,
    });

class $$OrderLinesTableFilterComposer
    extends Composer<_$AppDatabase, $OrderLinesTable> {
  $$OrderLinesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get orderId => $composableBuilder(
    column: $table.orderId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tableId => $composableBuilder(
    column: $table.tableId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get menuItemId => $composableBuilder(
    column: $table.menuItemId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get qty => $composableBuilder(
    column: $table.qty,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get note => $composableBuilder(
    column: $table.note,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get optionsText => $composableBuilder(
    column: $table.optionsText,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get priceSantim => $composableBuilder(
    column: $table.priceSantim,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get round => $composableBuilder(
    column: $table.round,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sync => $composableBuilder(
    column: $table.sync,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get error => $composableBuilder(
    column: $table.error,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OrderLinesTableOrderingComposer
    extends Composer<_$AppDatabase, $OrderLinesTable> {
  $$OrderLinesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get orderId => $composableBuilder(
    column: $table.orderId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tableId => $composableBuilder(
    column: $table.tableId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get menuItemId => $composableBuilder(
    column: $table.menuItemId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameEn => $composableBuilder(
    column: $table.nameEn,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nameAm => $composableBuilder(
    column: $table.nameAm,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get qty => $composableBuilder(
    column: $table.qty,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get note => $composableBuilder(
    column: $table.note,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get optionsText => $composableBuilder(
    column: $table.optionsText,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get priceSantim => $composableBuilder(
    column: $table.priceSantim,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get round => $composableBuilder(
    column: $table.round,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sync => $composableBuilder(
    column: $table.sync,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get error => $composableBuilder(
    column: $table.error,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OrderLinesTableAnnotationComposer
    extends Composer<_$AppDatabase, $OrderLinesTable> {
  $$OrderLinesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get orderId =>
      $composableBuilder(column: $table.orderId, builder: (column) => column);

  GeneratedColumn<String> get tableId =>
      $composableBuilder(column: $table.tableId, builder: (column) => column);

  GeneratedColumn<String> get menuItemId => $composableBuilder(
    column: $table.menuItemId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get nameEn =>
      $composableBuilder(column: $table.nameEn, builder: (column) => column);

  GeneratedColumn<String> get nameAm =>
      $composableBuilder(column: $table.nameAm, builder: (column) => column);

  GeneratedColumn<int> get qty =>
      $composableBuilder(column: $table.qty, builder: (column) => column);

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<String> get optionsText => $composableBuilder(
    column: $table.optionsText,
    builder: (column) => column,
  );

  GeneratedColumn<int> get priceSantim => $composableBuilder(
    column: $table.priceSantim,
    builder: (column) => column,
  );

  GeneratedColumn<int> get round =>
      $composableBuilder(column: $table.round, builder: (column) => column);

  GeneratedColumn<String> get state =>
      $composableBuilder(column: $table.state, builder: (column) => column);

  GeneratedColumn<String> get sync =>
      $composableBuilder(column: $table.sync, builder: (column) => column);

  GeneratedColumn<String> get error =>
      $composableBuilder(column: $table.error, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$OrderLinesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $OrderLinesTable,
          OrderLine,
          $$OrderLinesTableFilterComposer,
          $$OrderLinesTableOrderingComposer,
          $$OrderLinesTableAnnotationComposer,
          $$OrderLinesTableCreateCompanionBuilder,
          $$OrderLinesTableUpdateCompanionBuilder,
          (
            OrderLine,
            BaseReferences<_$AppDatabase, $OrderLinesTable, OrderLine>,
          ),
          OrderLine,
          PrefetchHooks Function()
        > {
  $$OrderLinesTableTableManager(_$AppDatabase db, $OrderLinesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OrderLinesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OrderLinesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OrderLinesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> orderId = const Value.absent(),
                Value<String> tableId = const Value.absent(),
                Value<String> menuItemId = const Value.absent(),
                Value<String> nameEn = const Value.absent(),
                Value<String?> nameAm = const Value.absent(),
                Value<int> qty = const Value.absent(),
                Value<String?> note = const Value.absent(),
                Value<String?> optionsText = const Value.absent(),
                Value<int> priceSantim = const Value.absent(),
                Value<int?> round = const Value.absent(),
                Value<String> state = const Value.absent(),
                Value<String> sync = const Value.absent(),
                Value<String?> error = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OrderLinesCompanion(
                id: id,
                orderId: orderId,
                tableId: tableId,
                menuItemId: menuItemId,
                nameEn: nameEn,
                nameAm: nameAm,
                qty: qty,
                note: note,
                optionsText: optionsText,
                priceSantim: priceSantim,
                round: round,
                state: state,
                sync: sync,
                error: error,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String orderId,
                required String tableId,
                required String menuItemId,
                required String nameEn,
                Value<String?> nameAm = const Value.absent(),
                required int qty,
                Value<String?> note = const Value.absent(),
                Value<String?> optionsText = const Value.absent(),
                required int priceSantim,
                Value<int?> round = const Value.absent(),
                required String state,
                required String sync,
                Value<String?> error = const Value.absent(),
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => OrderLinesCompanion.insert(
                id: id,
                orderId: orderId,
                tableId: tableId,
                menuItemId: menuItemId,
                nameEn: nameEn,
                nameAm: nameAm,
                qty: qty,
                note: note,
                optionsText: optionsText,
                priceSantim: priceSantim,
                round: round,
                state: state,
                sync: sync,
                error: error,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OrderLinesTable, OrderLine>(table),
                  BaseReferences<_$AppDatabase, $OrderLinesTable, OrderLine>(
                    db,
                    table,
                    e,
                  ),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OrderLinesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $OrderLinesTable,
      OrderLine,
      $$OrderLinesTableFilterComposer,
      $$OrderLinesTableOrderingComposer,
      $$OrderLinesTableAnnotationComposer,
      $$OrderLinesTableCreateCompanionBuilder,
      $$OrderLinesTableUpdateCompanionBuilder,
      (OrderLine, BaseReferences<_$AppDatabase, $OrderLinesTable, OrderLine>),
      OrderLine,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$CategoriesTableTableManager get categories =>
      $$CategoriesTableTableManager(_db, _db.categories);
  $$MenuItemsTableTableManager get menuItems =>
      $$MenuItemsTableTableManager(_db, _db.menuItems);
  $$OptionGroupsTableTableManager get optionGroups =>
      $$OptionGroupsTableTableManager(_db, _db.optionGroups);
  $$OptionChoicesTableTableManager get optionChoices =>
      $$OptionChoicesTableTableManager(_db, _db.optionChoices);
  $$CafeTablesTableTableManager get cafeTables =>
      $$CafeTablesTableTableManager(_db, _db.cafeTables);
  $$OutboxEntriesTableTableManager get outboxEntries =>
      $$OutboxEntriesTableTableManager(_db, _db.outboxEntries);
  $$KeyValuesTableTableManager get keyValues =>
      $$KeyValuesTableTableManager(_db, _db.keyValues);
  $$OrderLinesTableTableManager get orderLines =>
      $$OrderLinesTableTableManager(_db, _db.orderLines);
}
