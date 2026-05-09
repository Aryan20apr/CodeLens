;--- functions
(function_item name: (identifier) @function.name)

;--- classes
(struct_item name: (type_identifier) @class.name)
(enum_item name: (type_identifier) @class.name)
(impl_item type: (type_identifier) @class.name)

;--- imports
(use_declaration (scoped_identifier) @import.source)
(use_declaration (identifier) @import.source)

;--- entry_points
(function_item name: (identifier) @entry)